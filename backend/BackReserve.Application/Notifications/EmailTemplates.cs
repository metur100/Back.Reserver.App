using System.Globalization;
using System.Net;
using System.Text;
using BackReserve.Application.Abstractions;
using BackReserve.Domain.Entities;

namespace BackReserve.Application.Notifications;

public sealed record OrderEmailModel(
    string BakeryName,
    string LocationName,
    string LocationAddress,
    string PublicReference,
    DateOnly PickupDate,
    TimeOnly SlotStart,
    TimeOnly SlotEnd,
    IReadOnlyList<(string Name, int Quantity, decimal LineTotal)> Lines,
    decimal Total,
    string Currency,
    string? PickupInstructions,
    string? CancellationPolicy,
    DateTimeOffset CancellationDeadline,
    string TimeZoneId,
    string? StatusLink);

/// <summary>German transactional emails. All dynamic values are HTML-encoded. Emails never contain more personal data than necessary.</summary>
public static class EmailTemplates
{
    private static readonly CultureInfo De = CultureInfo.GetCultureInfo("de-DE");

    public static string Money(decimal value, string currency = "EUR") =>
        currency == "EUR" ? value.ToString("#,##0.00", De) + " €" : value.ToString("#,##0.00", De) + " " + currency;

    public static string Date(DateOnly date) => date.ToString("dddd, d. MMMM yyyy", De);

    public static string Time(TimeOnly time) => time.ToString("HH:mm", De);

    public static string LocalDateTime(DateTimeOffset utc, string timeZoneId)
    {
        var local = TimeZoneInfo.ConvertTime(utc, TimeZoneInfo.FindSystemTimeZoneById(timeZoneId));
        return local.ToString("dddd, d. MMMM yyyy 'um' HH:mm 'Uhr'", De);
    }

    private static string E(string? s) => WebUtility.HtmlEncode(s ?? "");

    private static string Layout(string title, string bodyHtml) => $"""
        <!doctype html><html lang="de"><head><meta charset="utf-8"><title>{E(title)}</title></head>
        <body style="margin:0;background:#faf6f0;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#2b211c">
        <div style="max-width:560px;margin:0 auto;padding:24px">
        <div style="background:#ffffff;border:1px solid #eadfd3;border-radius:12px;padding:24px">
        {bodyHtml}
        </div>
        <p style="font-size:12px;color:#7a6a5f;margin-top:16px">Diese E-Mail wurde über BackReserve versendet.</p>
        </div></body></html>
        """;

    private static (string Html, string Text) OrderBlock(OrderEmailModel m)
    {
        var rows = new StringBuilder();
        var text = new StringBuilder();
        foreach (var (name, qty, total) in m.Lines)
        {
            rows.Append($"<tr><td style=\"padding:4px 0\">{qty} × {E(name)}</td><td style=\"padding:4px 0;text-align:right\">{E(Money(total, m.Currency))}</td></tr>");
            text.AppendLine($"  {qty} x {name}  {Money(total, m.Currency)}");
        }
        var html = $"""
            <p style="font-size:14px;color:#7a6a5f;margin:0">Abholcode</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:2px;margin:4px 0 16px">{E(m.PublicReference)}</p>
            <p style="margin:0 0 4px"><strong>Abholung:</strong> {E(Date(m.PickupDate))}, {E(Time(m.SlotStart))}–{E(Time(m.SlotEnd))} Uhr</p>
            <p style="margin:0 0 16px"><strong>Standort:</strong> {E(m.LocationName)}, {E(m.LocationAddress)}</p>
            <table style="width:100%;border-collapse:collapse;font-size:15px">{rows}
            <tr><td style="padding-top:8px;border-top:1px solid #eadfd3"><strong>Gesamt</strong></td>
            <td style="padding-top:8px;border-top:1px solid #eadfd3;text-align:right"><strong>{E(Money(m.Total, m.Currency))}</strong></td></tr></table>
            <p style="margin:16px 0 0;padding:12px;background:#f3ece3;border-radius:8px">Bezahlung bei Abholung in der Bäckerei. Es wurde keine Online-Zahlung durchgeführt.</p>
            """;
        var plain = $"""
            Abholcode: {m.PublicReference}
            Abholung: {Date(m.PickupDate)}, {Time(m.SlotStart)}–{Time(m.SlotEnd)} Uhr
            Standort: {m.LocationName}, {m.LocationAddress}

            {text}  Gesamt: {Money(m.Total, m.Currency)}

            Bezahlung bei Abholung in der Bäckerei. Es wurde keine Online-Zahlung durchgeführt.
            """;
        return (html, plain);
    }

    public static EmailMessage OrderConfirmed(string to, OrderEmailModel m)
    {
        var (block, plain) = OrderBlock(m);
        var deadline = LocalDateTime(m.CancellationDeadline, m.TimeZoneId);
        var link = m.StatusLink is null ? "" : $"<p style=\"margin:20px 0\"><a href=\"{E(m.StatusLink)}\" style=\"background:#b5562b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none\">Bestellung ansehen</a></p>";
        var html = Layout("Reservierung bestätigt", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Deine Reservierung bei {E(m.BakeryName)} ist bestätigt</h1>
            <p style="margin:0 0 20px">Vielen Dank! Zeige bei der Abholung einfach deinen Abholcode oder QR-Code vor.</p>
            {block}
            {(string.IsNullOrWhiteSpace(m.PickupInstructions) ? "" : $"<p style=\"margin:16px 0 0\"><strong>Hinweise zur Abholung:</strong> {E(m.PickupInstructions)}</p>")}
            <p style="margin:16px 0 0"><strong>Stornierung:</strong> möglich bis {E(deadline)}. {E(m.CancellationPolicy)}</p>
            {link}
            """);
        var text = $"""
            Deine Reservierung bei {m.BakeryName} ist bestätigt.

            {plain}
            {(string.IsNullOrWhiteSpace(m.PickupInstructions) ? "" : "Hinweise zur Abholung: " + m.PickupInstructions)}
            Stornierung möglich bis {deadline}. {m.CancellationPolicy}
            {(m.StatusLink is null ? "" : "Bestellung ansehen: " + m.StatusLink)}
            """;
        return new EmailMessage(to, $"Reservierung bestätigt – {m.PublicReference} bei {m.BakeryName}", html, text, "order_confirmed");
    }

    public static EmailMessage OrderCancelled(string to, OrderEmailModel m, bool byBakery, string? reason)
    {
        var who = byBakery ? $"{m.BakeryName} hat deine Reservierung storniert." : "Deine Reservierung wurde wie gewünscht storniert.";
        var html = Layout("Reservierung storniert", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Reservierung {E(m.PublicReference)} storniert</h1>
            <p>{E(who)}</p>
            {(string.IsNullOrWhiteSpace(reason) ? "" : $"<p><strong>Grund:</strong> {E(reason)}</p>")}
            <p>Ursprüngliche Abholung: {E(Date(m.PickupDate))}, {E(Time(m.SlotStart))}–{E(Time(m.SlotEnd))} Uhr bei {E(m.LocationName)}.</p>
            """);
        var text = $"Reservierung {m.PublicReference} storniert.\n{who}\n{(string.IsNullOrWhiteSpace(reason) ? "" : "Grund: " + reason)}\nUrsprüngliche Abholung: {Date(m.PickupDate)}, {Time(m.SlotStart)} Uhr";
        return new EmailMessage(to, $"Reservierung storniert – {m.PublicReference}", html, text, "order_cancelled");
    }

    public static EmailMessage OrderReady(string to, OrderEmailModel m)
    {
        var html = Layout("Bestellung abholbereit", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Deine Bestellung ist abholbereit</h1>
            <p>{E(m.BakeryName)} hat deine Bestellung vorbereitet.</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:2px">{E(m.PublicReference)}</p>
            <p>Abholung: {E(Date(m.PickupDate))}, {E(Time(m.SlotStart))}–{E(Time(m.SlotEnd))} Uhr bei {E(m.LocationName)}.</p>
            <p>Bezahlung bei Abholung.</p>
            """);
        var text = $"Deine Bestellung {m.PublicReference} bei {m.BakeryName} ist abholbereit.\nAbholung: {Date(m.PickupDate)}, {Time(m.SlotStart)}–{Time(m.SlotEnd)} Uhr bei {m.LocationName}.\nBezahlung bei Abholung.";
        return new EmailMessage(to, $"Abholbereit – {m.PublicReference}", html, text, "order_ready");
    }

    public static EmailMessage PickupReminder(string to, OrderEmailModel m)
    {
        var (block, plain) = OrderBlock(m);
        var html = Layout("Erinnerung an deine Abholung", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Erinnerung: Abholung bei {E(m.BakeryName)}</h1>
            {block}
            """);
        return new EmailMessage(to, $"Erinnerung: Abholung {m.PublicReference}", html, $"Erinnerung: Abholung bei {m.BakeryName}\n\n{plain}", "pickup_reminder");
    }

    public static EmailMessage ConfirmEmail(string to, string firstName, string link) => new(
        to, "Bitte bestätige deine E-Mail-Adresse",
        Layout("E-Mail bestätigen", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Willkommen bei BackReserve, {E(firstName)}!</h1>
            <p>Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.</p>
            <p style="margin:20px 0"><a href="{E(link)}" style="background:#b5562b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">E-Mail-Adresse bestätigen</a></p>
            <p style="font-size:13px;color:#7a6a5f">Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.</p>
            """),
        $"Willkommen bei BackReserve, {firstName}!\nBitte bestätige deine E-Mail-Adresse: {link}", "confirm_email");

    public static EmailMessage AccountAlreadyExists(string to, string loginLink) => new(
        to, "Registrierungsversuch bei BackReserve",
        Layout("Konto existiert bereits", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Du hast bereits ein Konto</h1>
            <p>Jemand hat versucht, mit dieser E-Mail-Adresse ein neues Konto zu registrieren. Du kannst dich mit deinem bestehenden Konto anmelden oder dein Passwort zurücksetzen.</p>
            <p><a href="{E(loginLink)}">Zur Anmeldung</a></p>
            <p style="font-size:13px;color:#7a6a5f">Wenn du das nicht warst, musst du nichts tun.</p>
            """),
        $"Du hast bereits ein BackReserve-Konto. Anmeldung: {loginLink}", "account_exists");

    public static EmailMessage ResetPassword(string to, string link) => new(
        to, "Passwort zurücksetzen",
        Layout("Passwort zurücksetzen", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Passwort zurücksetzen</h1>
            <p>Über den folgenden Link kannst du ein neues Passwort festlegen. Der Link ist zeitlich begrenzt gültig.</p>
            <p style="margin:20px 0"><a href="{E(link)}" style="background:#b5562b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Neues Passwort festlegen</a></p>
            <p style="font-size:13px;color:#7a6a5f">Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren.</p>
            """),
        $"Passwort zurücksetzen: {link}", "reset_password");

    public static EmailMessage StaffInvitation(string to, string bakeryName, string roleName, string link, DateTimeOffset expiresAt) => new(
        to, $"Einladung zu {bakeryName} auf BackReserve",
        Layout("Einladung", $"""
            <h1 style="font-size:22px;margin:0 0 8px">Du wurdest eingeladen</h1>
            <p>{E(bakeryName)} lädt dich als <strong>{E(roleName)}</strong> zu BackReserve ein.</p>
            <p style="margin:20px 0"><a href="{E(link)}" style="background:#b5562b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Einladung annehmen</a></p>
            <p style="font-size:13px;color:#7a6a5f">Die Einladung ist gültig bis {E(expiresAt.ToString("dd.MM.yyyy HH:mm", De))} (UTC) und kann nur einmal verwendet werden.</p>
            """),
        $"{bakeryName} lädt dich als {roleName} zu BackReserve ein: {link}", "staff_invitation");

    public static string RoleName(Domain.Enums.MembershipRole role) => role switch
    {
        Domain.Enums.MembershipRole.Owner => "Inhaber/in",
        Domain.Enums.MembershipRole.Manager => "Filialleitung",
        _ => "Mitarbeiter/in",
    };

    public static OrderEmailModel BuildModel(Order order, Tenant tenant, BakeryLocation location, LocationSettings settings,
        IEnumerable<OrderItem> items, string? statusLink)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZoneId);
        return new OrderEmailModel(
            tenant.Name, location.Name, $"{location.Street}, {location.PostalCode} {location.City}", order.PublicReference,
            order.PickupDate, order.SlotStart, order.SlotEnd,
            items.Select(i => (i.ProductName, i.Quantity, i.LineTotal)).ToList(), order.Total, order.Currency,
            tenant.Settings?.PickupInstructions, tenant.Settings?.CancellationPolicyText,
            Domain.Rules.PickupCalendar.CancellationCutoffUtc(order.PickupDate, settings, tz), settings.TimeZoneId, statusLink);
    }
}
