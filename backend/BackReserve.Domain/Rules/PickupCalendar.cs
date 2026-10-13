using BackReserve.Domain.Entities;

namespace BackReserve.Domain.Rules;

public sealed record SlotDefinition(TimeOnly Start, TimeOnly End, DateTimeOffset StartUtc, DateTimeOffset EndUtc);

public enum DateAvailability
{
    Open,
    InPast,
    TooFarAhead,
    Closed,
    NoPickupOnWeekday,
    CutoffPassed,
    NotAcceptingOrders,
}

/// <summary>
/// Pure pickup-date and slot logic. All bakery configuration is expressed as local wall-clock time in the
/// location's IANA time zone and converted to UTC here, so daylight-saving transitions are handled in one place.
/// </summary>
public static class PickupCalendar
{
    public static TimeZoneInfo ResolveTimeZone(string id) => TimeZoneInfo.FindSystemTimeZoneById(id);

    public static bool IsValidTimeZone(string id)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(id); return true; }
        catch (TimeZoneNotFoundException) { return false; }
        catch (InvalidTimeZoneException) { return false; }
    }

    public static DateOnly LocalToday(DateTimeOffset nowUtc, TimeZoneInfo tz) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(nowUtc, tz).DateTime);

    /// <summary>
    /// Converts a local wall-clock time to UTC. Times inside a spring-forward gap are moved forward by the gap
    /// (02:30 becomes 03:30 CEST); ambiguous autumn times resolve to the earlier instant.
    /// </summary>
    public static DateTimeOffset ToUtc(DateOnly date, TimeOnly time, TimeZoneInfo tz)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        if (tz.IsInvalidTime(local))
        {
            // Interpret with the offset in force just before the gap: 02:30 (+01:00) = 01:30Z = 03:30 CEST.
            var offsetBeforeGap = tz.GetUtcOffset(local.AddHours(-3));
            return new DateTimeOffset(local, offsetBeforeGap).ToUniversalTime();
        }

        TimeSpan offset = tz.IsAmbiguousTime(local)
            ? tz.GetAmbiguousTimeOffsets(local).Max()
            : tz.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }

    public static bool IsInvalidLocalTime(DateOnly date, TimeOnly time, TimeZoneInfo tz) =>
        tz.IsInvalidTime(date.ToDateTime(time, DateTimeKind.Unspecified));

    public static DateTimeOffset OrderCutoffUtc(DateOnly pickupDate, LocationSettings s, TimeZoneInfo tz) =>
        ToUtc(pickupDate.AddDays(-s.OrderCutoffDaysBefore), s.OrderCutoffTime, tz);

    public static DateTimeOffset CancellationCutoffUtc(DateOnly pickupDate, LocationSettings s, TimeZoneInfo tz) =>
        ToUtc(pickupDate.AddDays(-s.CancellationCutoffDaysBefore), s.CancellationCutoffTime, tz);

    public static DateAvailability CheckDate(
        DateOnly date, LocationSettings settings, PickupScheduleRule? rule, bool isClosed,
        DateTimeOffset nowUtc, TimeZoneInfo tz)
    {
        if (!settings.AcceptsOrders) return DateAvailability.NotAcceptingOrders;
        var today = LocalToday(nowUtc, tz);
        if (date < today) return DateAvailability.InPast;
        if (date > today.AddDays(settings.MaxDaysAhead)) return DateAvailability.TooFarAhead;
        if (isClosed) return DateAvailability.Closed;
        if (rule is null || !rule.IsOpen) return DateAvailability.NoPickupOnWeekday;
        if (nowUtc >= OrderCutoffUtc(date, settings, tz)) return DateAvailability.CutoffPassed;
        return DateAvailability.Open;
    }

    /// <summary>Generates the configured slots for a date. Slots starting inside a DST gap do not exist and are skipped.</summary>
    public static IReadOnlyList<SlotDefinition> GenerateSlots(DateOnly date, PickupScheduleRule rule, TimeZoneInfo tz)
    {
        var slots = new List<SlotDefinition>();
        if (!rule.IsOpen || rule.SlotMinutes <= 0 || rule.PickupEnd <= rule.PickupStart) return slots;

        var start = rule.PickupStart;
        while (true)
        {
            var endTicks = start.Ticks + TimeSpan.FromMinutes(rule.SlotMinutes).Ticks;
            if (endTicks > rule.PickupEnd.Ticks) break;
            var end = new TimeOnly(endTicks);
            if (!IsInvalidLocalTime(date, start, tz))
            {
                slots.Add(new SlotDefinition(start, end, ToUtc(date, start, tz), ToUtc(date, end, tz)));
            }
            if (end >= rule.PickupEnd) break;
            start = end;
        }
        return slots;
    }

    /// <summary>A slot is time-eligible when its start lies at least the location's minimum notice and the product lead time in the future.</summary>
    public static bool IsSlotTimeEligible(SlotDefinition slot, LocationSettings s, DateTimeOffset nowUtc, int maxLeadTimeHours = 0)
    {
        var notice = TimeSpan.FromMinutes(Math.Max(s.MinAdvanceMinutes, maxLeadTimeHours * 60));
        return slot.StartUtc >= nowUtc + notice;
    }
}
