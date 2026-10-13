using System.Text.Json;
using BackReserve.Application.Abstractions;
using BackReserve.Domain.Entities;
using BackReserve.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;

namespace BackReserve.Infrastructure.Services;

public sealed class PayloadProtector(IDataProtectionProvider provider) : IPayloadProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("BackReserve.Payload.v1");
    public string Protect(string plaintext) => _protector.Protect(plaintext);
    public string Unprotect(string protectedPayload) => _protector.Unprotect(protectedPayload);
}

/// <summary>Adds the email to the outbox in the current unit of work; it is committed atomically with the business change.</summary>
public sealed class EmailOutbox(AppDbContext db, IPayloadProtector protector, TimeProvider clock) : IEmailOutbox
{
    public const string EmailType = "email";

    public void Enqueue(EmailMessage message)
    {
        var now = clock.GetUtcNow();
        db.OutboxMessages.Add(new OutboxMessage
        {
            Type = EmailType,
            Payload = protector.Protect(JsonSerializer.Serialize(message)),
            CreatedAt = now,
            NextAttemptAt = now,
        });
    }
}

public sealed class AuditLogger(AppDbContext db, TimeProvider clock) : IAuditLogger
{
    public void Log(Guid? tenantId, Guid? userId, string action, string entityType, string? entityId, object? details = null)
    {
        var json = details is null ? null : JsonSerializer.Serialize(details);
        if (json is { Length: > 4000 }) json = json[..4000];
        db.AuditLogs.Add(new AuditLog
        {
            TenantId = tenantId, UserId = userId, Action = action, EntityType = entityType, EntityId = entityId,
            Details = json, CreatedAt = clock.GetUtcNow(),
        });
    }
}
