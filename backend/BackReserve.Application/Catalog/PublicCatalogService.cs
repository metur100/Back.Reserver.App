using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Scheduling;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Catalog;

public static class StockLevels
{
    public static bool IsLow(int remaining, int maxSellable) => remaining > 0 && remaining <= Math.Max(3, maxSellable / 5);

    public static AvailabilityStatus Status(int remaining, int maxSellable) =>
        remaining <= 0 ? AvailabilityStatus.SoldOut : IsLow(remaining, maxSellable) ? AvailabilityStatus.Low : AvailabilityStatus.Available;

    public static IReadOnlyList<string> SplitLabels(string? labels) =>
        string.IsNullOrWhiteSpace(labels) ? [] : labels.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

/// <summary>
/// Read-only public catalog. Only published, active tenants with a usable subscription are visible, and only
/// published, non-archived products with stock records for the requested location and date are returned.
/// </summary>
public sealed class PublicCatalogService(IAppDbContext db, TimeProvider clock)
{
    public static readonly SubscriptionStatus[] BlockedSubscriptionStates = [SubscriptionStatus.Cancelled, SubscriptionStatus.Suspended];

    private IQueryable<Tenant> VisibleTenants() =>
        db.Tenants.AsNoTracking().Where(t =>
            t.IsPublished && t.Status == TenantStatus.Active &&
            (t.Subscription == null || !BlockedSubscriptionStates.Contains(t.Subscription.Status)));

    private async Task<Tenant> GetVisibleTenantAsync(string slug, CancellationToken ct) =>
        await VisibleTenants().Include(t => t.Settings).FirstOrDefaultAsync(t => t.Slug == slug.ToLower(), ct)
        ?? throw new NotFoundException("Diese Bäckerei wurde nicht gefunden.", "bakery_not_found");

    /// <summary>Loads a public location and verifies its tenant is publicly visible.</summary>
    public async Task<LocationSchedule> GetVisibleLocationScheduleAsync(Guid locationId, CancellationToken ct)
    {
        var schedule = await LocationScheduleLoader.LoadAsync(db, locationId, ct);
        if (schedule is null || !schedule.Location.IsActive)
            throw new NotFoundException("Dieser Standort wurde nicht gefunden.", "location_not_found");
        var visible = await VisibleTenants().AnyAsync(t => t.Id == schedule.Location.TenantId, ct);
        if (!visible) throw new NotFoundException("Dieser Standort wurde nicht gefunden.", "location_not_found");
        return schedule;
    }

    public async Task<PublicBakeryDto> GetBakeryAsync(string slug, CancellationToken ct)
    {
        var tenant = await GetVisibleTenantAsync(slug, ct);
        var locations = await GetLocationsAsync(tenant.Id, ct);
        var categories = await db.ProductCategories.AsNoTracking()
            .Where(c => c.TenantId == tenant.Id && c.IsActive)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Select(c => new PublicCategoryDto(c.Id, c.Name, c.Slug, c.SortOrder))
            .ToListAsync(ct);

        var s = tenant.Settings;
        return new PublicBakeryDto(
            tenant.Name, tenant.Slug, tenant.Description, tenant.LogoUrl, tenant.CoverImageUrl, tenant.BrandColor,
            tenant.ContactEmail, tenant.ContactPhone, tenant.Website, s.PickupInstructions, s.CancellationPolicyText,
            s.AllergenDisclaimer, s.RequireCustomerLastName, s.RequireCustomerPhone, s.Currency, locations, categories);
    }

    public async Task<IReadOnlyList<PublicLocationDto>> GetLocationsAsync(string slug, CancellationToken ct)
    {
        var tenant = await GetVisibleTenantAsync(slug, ct);
        return await GetLocationsAsync(tenant.Id, ct);
    }

    private async Task<IReadOnlyList<PublicLocationDto>> GetLocationsAsync(Guid tenantId, CancellationToken ct)
    {
        var locations = await db.Locations.AsNoTracking()
            .Include(l => l.Settings).Include(l => l.ScheduleRules)
            .Where(l => l.TenantId == tenantId && l.IsActive)
            .OrderBy(l => l.Name)
            .ToListAsync(ct);

        return locations.Select(l => new PublicLocationDto(
            l.Id, l.Name, l.Street, l.PostalCode, l.City, l.Phone, l.Email, l.Settings.TimeZoneId, l.Settings.AcceptsOrders,
            l.Settings.MaxDaysAhead, l.Settings.OrderCutoffDaysBefore, l.Settings.OrderCutoffTime,
            l.Settings.CancellationCutoffDaysBefore, l.Settings.CancellationCutoffTime,
            l.ScheduleRules.OrderBy(r => ((int)r.DayOfWeek + 6) % 7)
                .Select(r => new OpeningHoursDto(r.DayOfWeek, r.IsOpen, r.OpensAt, r.ClosesAt, r.PickupStart, r.PickupEnd))
                .ToList())).ToList();
    }

    /// <summary>Pickup dates from today until the booking horizon, with the reason when a date cannot be ordered.</summary>
    public async Task<IReadOnlyList<PublicAvailableDateDto>> GetAvailableDatesAsync(string slug, Guid locationId, CancellationToken ct)
    {
        var tenant = await GetVisibleTenantAsync(slug, ct);
        var schedule = await GetVisibleLocationScheduleAsync(locationId, ct);
        if (schedule.Location.TenantId != tenant.Id) throw new NotFoundException("Dieser Standort wurde nicht gefunden.", "location_not_found");

        var now = clock.GetUtcNow();
        var today = schedule.Today(now);
        var result = new List<PublicAvailableDateDto>();
        for (var i = 0; i <= schedule.Settings.MaxDaysAhead; i++)
        {
            var date = today.AddDays(i);
            var availability = schedule.CheckDate(date, now);
            if (availability == DateAvailability.Open)
            {
                // A date is only useful if at least one slot is still bookable.
                var anySlot = schedule.SlotsFor(date).Any(sl => PickupCalendar.IsSlotTimeEligible(sl, schedule.Settings, now));
                if (!anySlot) availability = DateAvailability.CutoffPassed;
            }
            result.Add(new PublicAvailableDateDto(
                date, availability == DateAvailability.Open, LocationSchedule.StatusCode(availability),
                availability is DateAvailability.Open ? PickupCalendar.OrderCutoffUtc(date, schedule.Settings, schedule.TimeZone) : null));
        }
        return result;
    }

    public async Task<PublicProductListDto> GetProductsAsync(string slug, Guid locationId, DateOnly date, CancellationToken ct)
    {
        var tenant = await GetVisibleTenantAsync(slug, ct);
        var schedule = await GetVisibleLocationScheduleAsync(locationId, ct);
        if (schedule.Location.TenantId != tenant.Id) throw new NotFoundException("Dieser Standort wurde nicht gefunden.", "location_not_found");

        var availability = schedule.CheckDate(date, clock.GetUtcNow());

        var rows = await db.DailyInventories.AsNoTracking()
            .Where(i => i.TenantId == tenant.Id && i.LocationId == locationId && i.Date == date && !i.IsUnavailable && i.PlannedQuantity > 0)
            .Where(i => i.Product.IsPublished && !i.Product.IsArchived)
            .Select(i => new { Inventory = i, i.Product })
            .ToListAsync(ct);

        var products = rows
            .OrderBy(r => r.Product.SortOrder).ThenBy(r => r.Product.Name)
            .Select(r =>
            {
                var remaining = r.Inventory.Remaining;
                return new PublicProductDto(
                    r.Product.Id, r.Product.Name, r.Product.Slug, r.Product.Description, r.Product.CategoryId, r.Product.BasePrice,
                    r.Product.Currency, r.Product.ImageUrl, r.Product.Allergens, r.Product.Ingredients,
                    StockLevels.SplitLabels(r.Product.DietaryLabels), r.Product.LeadTimeHours, remaining,
                    StockLevels.Status(remaining, r.Inventory.MaxSellable));
            }).ToList();

        return new PublicProductListDto(locationId, date, availability == DateAvailability.Open, LocationSchedule.StatusCode(availability), products);
    }

    public async Task<PickupSlotListDto> GetPickupSlotsAsync(Guid locationId, DateOnly date, IReadOnlyCollection<Guid>? productIds, CancellationToken ct)
    {
        var schedule = await GetVisibleLocationScheduleAsync(locationId, ct);
        var now = clock.GetUtcNow();
        var availability = schedule.CheckDate(date, now);
        if (availability != DateAvailability.Open)
            return new PickupSlotListDto(locationId, date, false, LocationSchedule.StatusCode(availability), []);

        var leadTime = 0;
        if (productIds is { Count: > 0 })
        {
            leadTime = await db.Products.AsNoTracking()
                .Where(p => p.TenantId == schedule.Location.TenantId && productIds.Contains(p.Id))
                .Select(p => (int?)p.LeadTimeHours).MaxAsync(ct) ?? 0;
        }

        var rule = schedule.RuleFor(date)!;
        var counters = await db.PickupSlotCounters.AsNoTracking()
            .Where(c => c.LocationId == locationId && c.Date == date)
            .ToDictionaryAsync(c => c.SlotStart, ct);

        var slots = schedule.SlotsFor(date).Select(slot =>
        {
            counters.TryGetValue(slot.Start, out var counter);
            var used = counter?.OrderCount ?? 0;
            var remainingOrders = Math.Max(0, rule.MaxOrdersPerSlot - used);
            string? reason = null;
            if (!PickupCalendar.IsSlotTimeEligible(slot, schedule.Settings, now, leadTime)) reason = "too_soon";
            else if (remainingOrders == 0) reason = "full";
            else if (rule.MaxItemsPerSlot is { } maxItems && (counter?.ItemCount ?? 0) >= maxItems) reason = "full";
            return new PickupSlotDto(slot.Start, slot.End, slot.StartUtc, reason is null, remainingOrders, reason);
        }).ToList();

        return new PickupSlotListDto(locationId, date, true, "open", slots);
    }
}
