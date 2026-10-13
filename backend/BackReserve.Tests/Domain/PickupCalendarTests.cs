using BackReserve.Domain.Entities;
using BackReserve.Domain.Rules;

namespace BackReserve.Tests.Domain;

public class PickupCalendarTests
{
    private static readonly TimeZoneInfo Berlin = PickupCalendar.ResolveTimeZone("Europe/Berlin");

    private static PickupScheduleRule Rule(DayOfWeek day, bool open = true, int slot = 30, string start = "07:00", string end = "09:00") => new()
    {
        DayOfWeek = day, IsOpen = open, SlotMinutes = slot, PickupStart = TimeOnly.Parse(start), PickupEnd = TimeOnly.Parse(end), MaxOrdersPerSlot = 10,
    };

    private static LocationSettings Settings(int cutoffDays = 1, string cutoff = "18:00", int maxDays = 14, int minAdvance = 60) => new()
    {
        TimeZoneId = "Europe/Berlin", OrderCutoffDaysBefore = cutoffDays, OrderCutoffTime = TimeOnly.Parse(cutoff),
        MaxDaysAhead = maxDays, MinAdvanceMinutes = minAdvance, CancellationCutoffDaysBefore = 1, CancellationCutoffTime = new TimeOnly(18, 0),
    };

    [Fact]
    public void Generates_half_hour_slots_within_pickup_window()
    {
        var date = new DateOnly(2026, 10, 14); // Wednesday
        var slots = PickupCalendar.GenerateSlots(date, Rule(DayOfWeek.Wednesday), Berlin);

        Assert.Equal(["07:00", "07:30", "08:00", "08:30"], slots.Select(s => s.Start.ToString("HH:mm")));
        Assert.Equal(new TimeOnly(9, 0), slots[^1].End);
        // CEST = UTC+2 in October before the change.
        Assert.Equal(new DateTimeOffset(2026, 10, 14, 5, 0, 0, TimeSpan.Zero), slots[0].StartUtc);
    }

    [Fact]
    public void Partial_trailing_slot_is_not_generated()
    {
        var slots = PickupCalendar.GenerateSlots(new DateOnly(2026, 10, 14), Rule(DayOfWeek.Wednesday, slot: 45, end: "08:40"), Berlin);
        Assert.Equal(["07:00", "07:45"], slots.Select(s => s.Start.ToString("HH:mm")));
    }

    [Fact]
    public void Closed_rule_yields_no_slots() =>
        Assert.Empty(PickupCalendar.GenerateSlots(new DateOnly(2026, 10, 14), Rule(DayOfWeek.Wednesday, open: false), Berlin));

    [Fact]
    public void Spring_forward_gap_slots_are_skipped_and_utc_stays_monotonic()
    {
        // 29 March 2026: clocks jump from 02:00 to 03:00 in Europe/Berlin.
        var date = new DateOnly(2026, 3, 29);
        var slots = PickupCalendar.GenerateSlots(date, Rule(DayOfWeek.Sunday, slot: 30, start: "01:00", end: "04:00"), Berlin);

        Assert.DoesNotContain(slots, s => s.Start == new TimeOnly(2, 0) || s.Start == new TimeOnly(2, 30));
        Assert.Contains(slots, s => s.Start == new TimeOnly(3, 0));
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 0, 0, TimeSpan.Zero), slots.First(s => s.Start == new TimeOnly(3, 0)).StartUtc);
        Assert.True(slots.Zip(slots.Skip(1)).All(p => p.First.StartUtc < p.Second.StartUtc));
    }

    [Fact]
    public void Fall_back_ambiguous_time_resolves_to_earlier_instant()
    {
        // 25 October 2026: 02:30 happens twice; the first occurrence is CEST (UTC+2).
        var utc = PickupCalendar.ToUtc(new DateOnly(2026, 10, 25), new TimeOnly(2, 30), Berlin);
        Assert.Equal(new DateTimeOffset(2026, 10, 25, 0, 30, 0, TimeSpan.Zero), utc);
    }

    [Fact]
    public void Time_in_gap_is_moved_forward()
    {
        var utc = PickupCalendar.ToUtc(new DateOnly(2026, 3, 29), new TimeOnly(2, 30), Berlin);
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 30, 0, TimeSpan.Zero), utc); // = 03:30 CEST
    }

    [Theory]
    // Order cutoff: 18:00 local on the previous day (16:00 UTC in CEST).
    [InlineData("2026-10-13T15:59:00Z", DateAvailability.Open)]
    [InlineData("2026-10-13T16:00:00Z", DateAvailability.CutoffPassed)]
    [InlineData("2026-10-14T06:00:00Z", DateAvailability.CutoffPassed)]
    public void Order_cutoff_is_evaluated_in_location_time_zone(string now, DateAvailability expected)
    {
        var date = new DateOnly(2026, 10, 14);
        var result = PickupCalendar.CheckDate(date, Settings(), Rule(DayOfWeek.Wednesday), false, DateTimeOffset.Parse(now), Berlin);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void Same_day_orders_possible_when_cutoff_is_zero_days()
    {
        var now = DateTimeOffset.Parse("2026-10-14T04:00:00Z"); // 06:00 local
        var result = PickupCalendar.CheckDate(new DateOnly(2026, 10, 14), Settings(cutoffDays: 0, cutoff: "10:00"), Rule(DayOfWeek.Wednesday), false, now, Berlin);
        Assert.Equal(DateAvailability.Open, result);
    }

    [Fact]
    public void Rejects_past_closed_far_future_and_weekday_without_pickup()
    {
        var now = DateTimeOffset.Parse("2026-10-12T08:00:00Z");
        var s = Settings(maxDays: 7);
        Assert.Equal(DateAvailability.InPast, PickupCalendar.CheckDate(new DateOnly(2026, 10, 11), s, Rule(DayOfWeek.Sunday), false, now, Berlin));
        Assert.Equal(DateAvailability.TooFarAhead, PickupCalendar.CheckDate(new DateOnly(2026, 10, 20), s, Rule(DayOfWeek.Tuesday), false, now, Berlin));
        Assert.Equal(DateAvailability.Closed, PickupCalendar.CheckDate(new DateOnly(2026, 10, 14), s, Rule(DayOfWeek.Wednesday), true, now, Berlin));
        Assert.Equal(DateAvailability.NoPickupOnWeekday, PickupCalendar.CheckDate(new DateOnly(2026, 10, 14), s, Rule(DayOfWeek.Wednesday, open: false), false, now, Berlin));
        Assert.Equal(DateAvailability.NoPickupOnWeekday, PickupCalendar.CheckDate(new DateOnly(2026, 10, 14), s, null, false, now, Berlin));
        s.AcceptsOrders = false;
        Assert.Equal(DateAvailability.NotAcceptingOrders, PickupCalendar.CheckDate(new DateOnly(2026, 10, 14), s, Rule(DayOfWeek.Wednesday), false, now, Berlin));
    }

    [Fact]
    public void Local_today_differs_from_utc_date_around_midnight()
    {
        var now = DateTimeOffset.Parse("2026-10-13T22:30:00Z"); // 00:30 on 14 Oct in Berlin
        Assert.Equal(new DateOnly(2026, 10, 14), PickupCalendar.LocalToday(now, Berlin));
    }

    [Fact]
    public void Slot_eligibility_respects_min_advance_and_product_lead_time()
    {
        var slot = PickupCalendar.GenerateSlots(new DateOnly(2026, 10, 14), Rule(DayOfWeek.Wednesday), Berlin)[0]; // 05:00Z
        var s = Settings(minAdvance: 60);
        Assert.True(PickupCalendar.IsSlotTimeEligible(slot, s, DateTimeOffset.Parse("2026-10-14T04:00:00Z")));
        Assert.False(PickupCalendar.IsSlotTimeEligible(slot, s, DateTimeOffset.Parse("2026-10-14T04:01:00Z")));
        Assert.False(PickupCalendar.IsSlotTimeEligible(slot, s, DateTimeOffset.Parse("2026-10-13T10:00:00Z"), maxLeadTimeHours: 24));
        Assert.True(PickupCalendar.IsSlotTimeEligible(slot, s, DateTimeOffset.Parse("2026-10-13T05:00:00Z"), maxLeadTimeHours: 24));
    }

    [Fact]
    public void Cancellation_cutoff_uses_configured_days_and_time()
    {
        var s = Settings();
        Assert.Equal(DateTimeOffset.Parse("2026-10-13T16:00:00Z"), PickupCalendar.CancellationCutoffUtc(new DateOnly(2026, 10, 14), s, Berlin));
    }

    [Fact]
    public void Validates_time_zone_ids()
    {
        Assert.True(PickupCalendar.IsValidTimeZone("Europe/Vienna"));
        Assert.False(PickupCalendar.IsValidTimeZone("Mars/Olympus"));
    }
}
