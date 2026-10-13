using System.Collections.Concurrent;
using BackReserve.Application.Abstractions;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace BackReserve.Infrastructure.Email;

public sealed class EmailOptions
{
    public const string Section = "Email";
    /// <summary>"Smtp" or "None". With "None" nothing is sent and messages are marked as skipped (never as delivered).</summary>
    public string Provider { get; set; } = "None";
    public string SmtpHost { get; set; } = "localhost";
    public int SmtpPort { get; set; } = 1025;
    /// <summary>"None", "StartTls" or "SslOnConnect".</summary>
    public string Security { get; set; } = "None";
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = "no-reply@backreserve.example";
    public string FromName { get; set; } = "BackReserve";
    /// <summary>Development only: keep a copy of every message in memory for GET /api/v1/dev/mailbox.</summary>
    public bool CaptureInDevMailbox { get; set; }
}

public sealed record CapturedEmail(Guid Id, DateTimeOffset SentAt, string To, string Subject, string TextBody, string HtmlBody, string Category);

/// <summary>In-memory copy of recently sent mails for local development and automated tests. Never enabled in production.</summary>
public sealed class DevMailbox
{
    private readonly ConcurrentQueue<CapturedEmail> _messages = new();

    public void Add(EmailMessage m, DateTimeOffset now)
    {
        _messages.Enqueue(new CapturedEmail(Guid.NewGuid(), now, m.To, m.Subject, m.TextBody, m.HtmlBody, m.Category));
        while (_messages.Count > 500 && _messages.TryDequeue(out _)) { }
    }

    public IReadOnlyList<CapturedEmail> All() => _messages.Reverse().ToList();

    public void Clear() => _messages.Clear();
}

public sealed class EmailNotConfiguredException() : Exception("No email provider configured.");

public sealed class EmailSender(IOptions<EmailOptions> options, DevMailbox mailbox, TimeProvider clock, ILogger<EmailSender> logger) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var o = options.Value;
        if (o.CaptureInDevMailbox) mailbox.Add(message, clock.GetUtcNow());

        if (!string.Equals(o.Provider, "Smtp", StringComparison.OrdinalIgnoreCase))
        {
            if (o.CaptureInDevMailbox) return; // captured locally is the intended delivery in development
            throw new EmailNotConfiguredException();
        }

        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(o.FromName, o.FromAddress));
        mime.To.Add(MailboxAddress.Parse(message.To));
        mime.Subject = message.Subject;
        mime.Body = new BodyBuilder { HtmlBody = message.HtmlBody, TextBody = message.TextBody }.ToMessageBody();

        using var client = new SmtpClient();
        var security = o.Security switch
        {
            "StartTls" => SecureSocketOptions.StartTls,
            "SslOnConnect" => SecureSocketOptions.SslOnConnect,
            _ => SecureSocketOptions.None,
        };
        await client.ConnectAsync(o.SmtpHost, o.SmtpPort, security, ct);
        if (!string.IsNullOrEmpty(o.Username)) await client.AuthenticateAsync(o.Username, o.Password ?? "", ct);
        await client.SendAsync(mime, ct);
        await client.DisconnectAsync(true, ct);
        // Category only: recipients are personal data and are not logged.
        logger.LogInformation("Email of category {Category} delivered via SMTP.", message.Category);
    }
}
