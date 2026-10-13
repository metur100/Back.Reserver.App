using System.Text.RegularExpressions;
using BackReserve.Application.Contracts;
using BackReserve.Application.Inventory;
using FluentValidation;

namespace BackReserve.Application.Validation;

internal static partial class Rules
{
    public const int MaxNote = 500;

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    public static partial Regex SlugRegex();

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    public static partial Regex ColorRegex();

    [GeneratedRegex(@"^[0-9 +()\-/]{5,30}$")]
    public static partial Regex PhoneRegex();

    public static bool IsSafeUrl(string? url) =>
        string.IsNullOrWhiteSpace(url) ||
        url.StartsWith("/media/", StringComparison.Ordinal) ||
        (Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps);

    public static IRuleBuilderOptions<T, string?> SafeUrl<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(IsSafeUrl).WithMessage("Bitte eine gültige https-Adresse angeben.").MaximumLength(500);

    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage("Bitte ein Passwort eingeben.")
            .MinimumLength(10).WithMessage("Das Passwort muss mindestens 10 Zeichen lang sein.")
            .MaximumLength(128)
            .Must(p => p.Any(char.IsLetter) && p.Any(char.IsDigit)).WithMessage("Das Passwort muss Buchstaben und Ziffern enthalten.");
}

public sealed class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty().WithMessage("Bitte einen Standort wählen.");
        RuleFor(x => x.Items).NotEmpty().WithMessage("Der Warenkorb ist leer.")
            .Must(i => i.Count <= 50).WithMessage("Zu viele verschiedene Produkte in einer Bestellung.")
            .Must(i => i.Select(x => x.ProductId).Distinct().Count() == i.Count).WithMessage("Jedes Produkt darf nur einmal vorkommen.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ProductId).NotEmpty();
            item.RuleFor(i => i.Quantity).InclusiveBetween(1, 200).WithMessage("Die Menge muss zwischen 1 und 200 liegen.");
        });
        RuleFor(x => x.Customer).NotNull().SetValidator(new CustomerDetailsValidator());
        RuleFor(x => x.Note).MaximumLength(Rules.MaxNote).WithMessage($"Die Anmerkung darf höchstens {Rules.MaxNote} Zeichen lang sein.");
        RuleFor(x => x.AcceptTerms).Equal(true).WithMessage("Bitte bestätige die Bedingungen und Datenschutzhinweise.");
    }
}

public sealed class CustomerDetailsValidator : AbstractValidator<CustomerDetailsRequest>
{
    public CustomerDetailsValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Bitte gib deinen Vornamen an.").MaximumLength(80);
        RuleFor(x => x.LastName).MaximumLength(80);
        RuleFor(x => x.Email).NotEmpty().WithMessage("Bitte gib deine E-Mail-Adresse an.")
            .EmailAddress().WithMessage("Bitte gib eine gültige E-Mail-Adresse an.").MaximumLength(254);
        RuleFor(x => x.Phone).Matches(Rules.PhoneRegex()).When(x => !string.IsNullOrWhiteSpace(x.Phone))
            .WithMessage("Bitte gib eine gültige Telefonnummer an.");
    }
}

public sealed class UpsertProductRequestValidator : AbstractValidator<UpsertProductRequest>
{
    public UpsertProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Bitte einen Produktnamen angeben.").MaximumLength(120);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.BasePrice).InclusiveBetween(0m, 9999.99m).WithMessage("Der Preis muss zwischen 0 und 9.999,99 € liegen.")
            .Must(p => decimal.Round(p, 2) == p).WithMessage("Der Preis darf höchstens zwei Nachkommastellen haben.");
        RuleFor(x => x.ImageUrl).SafeUrl();
        RuleFor(x => x.Allergens).MaximumLength(1000);
        RuleFor(x => x.Ingredients).MaximumLength(2000);
        RuleFor(x => x.DietaryLabels).Must(l => l is null || (l.Count <= 10 && l.All(s => s.Length <= 40)))
            .WithMessage("Höchstens 10 Kennzeichnungen mit je 40 Zeichen.");
        RuleFor(x => x.LeadTimeHours).InclusiveBetween(0, 24 * 30).WithMessage("Die Vorlaufzeit muss zwischen 0 und 720 Stunden liegen.");
        RuleFor(x => x.DefaultDailyQuantity).InclusiveBetween(0, 100000).When(x => x.DefaultDailyQuantity.HasValue);
        RuleFor(x => x.SortOrder).InclusiveBetween(-10000, 10000);
    }
}

public sealed class UpsertCategoryRequestValidator : AbstractValidator<UpsertCategoryRequest>
{
    public UpsertCategoryRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Bitte einen Kategorienamen angeben.").MaximumLength(80);
    }
}

public sealed class UpdateDailyInventoryRequestValidator : AbstractValidator<UpdateDailyInventoryRequest>
{
    public UpdateDailyInventoryRequestValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty().Must(i => i.Count <= 500)
            .Must(i => i.Select(x => x.ProductId).Distinct().Count() == i.Count).WithMessage("Jedes Produkt darf nur einmal vorkommen.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.PlannedQuantity).InclusiveBetween(0, 100000).WithMessage("Die geplante Menge muss zwischen 0 und 100.000 liegen.");
            item.RuleFor(i => i.SafetyBuffer).GreaterThanOrEqualTo(0).WithMessage("Der Puffer darf nicht negativ sein.");
            item.RuleFor(i => i).Must(i => i.SafetyBuffer <= i.PlannedQuantity).WithMessage("Der Puffer darf nicht größer als die geplante Menge sein.");
        });
    }
}

public sealed class CopyDayRequestValidator : AbstractValidator<CopyDayRequest>
{
    public CopyDayRequestValidator() => RuleFor(x => x.LocationId).NotEmpty();
}

public sealed class ApplyDefaultsRequestValidator : AbstractValidator<ApplyDefaultsRequest>
{
    public ApplyDefaultsRequestValidator() => RuleFor(x => x.LocationId).NotEmpty();
}

public sealed class LocationSettingsDtoValidator : AbstractValidator<LocationSettingsDto>
{
    public LocationSettingsDtoValidator()
    {
        RuleFor(x => x.TimeZoneId).NotEmpty().MaximumLength(64);
        RuleFor(x => x.OrderCutoffDaysBefore).InclusiveBetween(0, 14).WithMessage("Der Bestellschluss muss zwischen 0 und 14 Tagen vorher liegen.");
        RuleFor(x => x.MinAdvanceMinutes).InclusiveBetween(0, 60 * 24 * 7);
        RuleFor(x => x.MaxDaysAhead).InclusiveBetween(1, 90).WithMessage("Es kann 1 bis 90 Tage im Voraus bestellt werden.");
        RuleFor(x => x.CancellationCutoffDaysBefore).InclusiveBetween(0, 14);
    }
}

public sealed class UpsertLocationRequestValidator : AbstractValidator<UpsertLocationRequest>
{
    public UpsertLocationRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Bitte einen Namen angeben.").MaximumLength(120);
        RuleFor(x => x.Street).NotEmpty().WithMessage("Bitte Straße und Hausnummer angeben.").MaximumLength(200);
        RuleFor(x => x.PostalCode).NotEmpty().WithMessage("Bitte die Postleitzahl angeben.").MaximumLength(10);
        RuleFor(x => x.City).NotEmpty().WithMessage("Bitte den Ort angeben.").MaximumLength(100);
        RuleFor(x => x.Country).MaximumLength(2);
        RuleFor(x => x.Phone).Matches(Rules.PhoneRegex()).When(x => !string.IsNullOrWhiteSpace(x.Phone)).WithMessage("Ungültige Telefonnummer.");
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Ungültige E-Mail-Adresse.");
        RuleFor(x => x.Settings).NotNull().SetValidator(new LocationSettingsDtoValidator());
    }
}

public sealed class UpdateScheduleRequestValidator : AbstractValidator<UpdateScheduleRequest>
{
    public UpdateScheduleRequestValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty();
        RuleFor(x => x.Rules).NotEmpty().Must(r => r.Select(x => x.DayOfWeek).Distinct().Count() == r.Count)
            .WithMessage("Jeder Wochentag darf nur einmal vorkommen.");
        RuleForEach(x => x.Rules).ChildRules(rule =>
        {
            rule.RuleFor(r => r.SlotMinutes).InclusiveBetween(5, 240).WithMessage("Die Zeitfensterlänge muss zwischen 5 und 240 Minuten liegen.");
            rule.RuleFor(r => r.MaxOrdersPerSlot).InclusiveBetween(1, 1000).WithMessage("Die Kapazität muss zwischen 1 und 1000 Bestellungen liegen.");
            rule.RuleFor(r => r.MaxItemsPerSlot).InclusiveBetween(1, 100000).When(r => r.MaxItemsPerSlot.HasValue);
            rule.RuleFor(r => r).Must(r => !r.IsOpen || r.PickupEnd > r.PickupStart)
                .WithMessage("Das Ende der Abholzeit muss nach dem Beginn liegen.");
            rule.RuleFor(r => r).Must(r => !r.IsOpen || r.PickupEnd.ToTimeSpan() - r.PickupStart.ToTimeSpan() >= TimeSpan.FromMinutes(r.SlotMinutes))
                .WithMessage("Das Abholfenster ist kürzer als ein Zeitfenster.");
        });
    }
}

public sealed class InviteStaffRequestValidator : AbstractValidator<InviteStaffRequest>
{
    public InviteStaffRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Bitte eine gültige E-Mail-Adresse angeben.").MaximumLength(254);
        RuleFor(x => x.Role).IsInEnum();
        RuleFor(x => x.LocationIds).NotNull();
    }
}

public sealed class UpdateMembershipRequestValidator : AbstractValidator<UpdateMembershipRequest>
{
    public UpdateMembershipRequestValidator()
    {
        RuleFor(x => x.Role).IsInEnum();
        RuleFor(x => x.LocationIds).NotNull();
    }
}

public sealed class UpdateTenantSettingsRequestValidator : AbstractValidator<UpdateTenantSettingsRequest>
{
    public UpdateTenantSettingsRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Bitte den Namen der Bäckerei angeben.").MaximumLength(120);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.LogoUrl).SafeUrl();
        RuleFor(x => x.CoverImageUrl).SafeUrl();
        RuleFor(x => x.Website).SafeUrl();
        RuleFor(x => x.BrandColor).Matches(Rules.ColorRegex()).When(x => !string.IsNullOrWhiteSpace(x.BrandColor))
            .WithMessage("Bitte eine Farbe im Format #RRGGBB angeben.");
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.ContactEmail));
        RuleFor(x => x.ContactPhone).Matches(Rules.PhoneRegex()).When(x => !string.IsNullOrWhiteSpace(x.ContactPhone));
        RuleFor(x => x.PickupReminderHoursBefore).InclusiveBetween(1, 72);
        RuleFor(x => x.PickupInstructions).MaximumLength(1000);
        RuleFor(x => x.CancellationPolicyText).MaximumLength(1000);
        RuleFor(x => x.AllergenDisclaimer).MaximumLength(1000);
        RuleFor(x => x.CustomerDataRetentionDays).InclusiveBetween(0, 3650);
    }
}

public sealed class AddClosureRequestValidator : AbstractValidator<AddClosureRequest>
{
    public AddClosureRequestValidator() => RuleFor(x => x.Reason).MaximumLength(200);
}

public sealed class OrderActionRequestValidator : AbstractValidator<OrderActionRequest>
{
    public OrderActionRequestValidator() => RuleFor(x => x.Reason).MaximumLength(500);
}

public sealed class ReportProblemRequestValidator : AbstractValidator<ReportProblemRequest>
{
    public ReportProblemRequestValidator() =>
        RuleFor(x => x.Note).NotEmpty().WithMessage("Bitte beschreibe das Problem kurz.").MaximumLength(450);
}

public sealed class RegisterBakeryRequestValidator : AbstractValidator<RegisterBakeryRequest>
{
    public RegisterBakeryRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Bitte den Vornamen angeben.").MaximumLength(80);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Bitte den Nachnamen angeben.").MaximumLength(80);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Bitte eine gültige E-Mail-Adresse angeben.").MaximumLength(254);
        RuleFor(x => x.Password).StrongPassword();
        RuleFor(x => x.BakeryName).NotEmpty().WithMessage("Bitte den Namen der Bäckerei angeben.").MaximumLength(120);
        RuleFor(x => x.Slug).Matches(Rules.SlugRegex()).When(x => !string.IsNullOrWhiteSpace(x.Slug))
            .WithMessage("Die Adresse darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.").MaximumLength(60);
        RuleFor(x => x.AcceptTerms).Equal(true).WithMessage("Bitte akzeptieren Sie die Nutzungsbedingungen.");
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("Bitte die E-Mail-Adresse angeben.").MaximumLength(254);
        RuleFor(x => x.Password).NotEmpty().WithMessage("Bitte das Passwort angeben.").MaximumLength(128);
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Token).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.NewPassword).StrongPassword();
    }
}

public sealed class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator() => RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254);
}

public sealed class AcceptInvitationRequestValidator : AbstractValidator<AcceptInvitationRequest>
{
    public AcceptInvitationRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
        RuleFor(x => x.FirstName).MaximumLength(80);
        RuleFor(x => x.LastName).MaximumLength(80);
    }
}
