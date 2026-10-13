using BackReserve.Application.Abstractions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Scheduling;

/// <summary>Everything needed to evaluate pickup dates and slots for one location.</summary>
public sealed class LocationSchedule
{
    public required BakeryLocation Location { get; init; }
    public required LocationSettings Settings { get; init; }
    public required IReadOnlyList<PickupScheduleRule> Rules { get; init; }
    public required IReadOnlySet<DateOnly> Closures { get; init; }
    public required TimeZoneInfo TimeZone { get; init; }

    public PickupScheduleRule? RuleFor(DateOnly date) => Rules.FirstOrDefault(r => r.DayOfWeek == date.DayOfWeek);

    public DateAvailability CheckDate(DateOnly date, DateTimeOffset nowUtc) =>
        PickupCalendar.CheckDate(date, Settings, RuleFor(date), Closures.Contains(date), nowUtc, TimeZone);

    public IReadOnlyList<SlotDefinition> SlotsFor(DateOnly date) =>
        RuleFor(date) is { } rule ? PickupCalendar.GenerateSlots(date, rule, TimeZone) : [];

    public DateOnly Today(DateTimeOffset nowUtc) => PickupCalendar.LocalToday(nowUtc, TimeZone);

    public static string StatusCode(DateAvailability a) => a switch
    {
        DateAvailability.Open => "open",
        DateAvailability.InPast => "past",
        DateAvailability.TooFarAhead => "too_far_ahead",
        DateAvailability.Closed => "closed",
        DateAvailability.NoPickupOnWeekday => "no_pickup",
        DateAvailability.CutoffPassed => "cutoff_passed",
        DateAvailability.NotAcceptingOrders => "not_accepting_orders",
        _ => "unavailable",
    };

    public static string GermanMessage(DateAvailability a) => a switch
    {
        DateAvailability.InPast => "Dieses Datum liegt in der Vergangenheit.",
        DateAvailability.TooFarAhead => "Für dieses Datum kann noch nicht vorbestellt werden.",
        DateAvailability.Closed => "An diesem Tag ist der Standort geschlossen.",
        DateAvailability.NoPickupOnWeekday => "An diesem Wochentag ist keine Abholung möglich.",
        DateAvailability.CutoffPassed => "Der Bestellschluss für dieses Datum ist bereits vorbei.",
        DateAvailability.NotAcceptingOrders => "Dieser Standort nimmt derzeit keine Vorbestellungen an.",
        _ => "Für dieses Datum ist keine Vorbestellung möglich.",
    };
}

public static class LocationScheduleLoader
{
    public static async Task<LocationSchedule?> LoadAsync(IAppDbContext db, Guid locationId, CancellationToken ct, DateOnly? closuresFrom = null)
    {
        var location = await db.Locations.AsNoTracking()
            .Include(l => l.Settings)
            .Include(l => l.ScheduleRules)
            .FirstOrDefaultAsync(l => l.Id == locationId, ct);
        if (location is null) return null;

        var from = closuresFrom ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2));
        var closures = await db.LocationClosures.AsNoTracking()
            .Where(c => c.LocationId == locationId && c.Date >= from)
            .Select(c => c.Date)
            .ToListAsync(ct);

        return new LocationSchedule
        {
            Location = location,
            Settings = location.Settings,
            Rules = location.ScheduleRules.ToList(),
            Closures = closures.ToHashSet(),
            TimeZone = PickupCalendar.ResolveTimeZone(location.Settings.TimeZoneId),
        };
    }
}
