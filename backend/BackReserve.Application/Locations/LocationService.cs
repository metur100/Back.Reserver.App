using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Locations;

public sealed class LocationService(IAppDbContext db, IAdminContextAccessor admin, SubscriptionGuard guard, IAuditLogger audit, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    public static IReadOnlyList<PickupScheduleRule> DefaultRules(Guid tenantId, Guid locationId) =>
        Enum.GetValues<DayOfWeek>().Select(d => new PickupScheduleRule
        {
            TenantId = tenantId,
            LocationId = locationId,
            DayOfWeek = d,
            IsOpen = d != DayOfWeek.Sunday,
            OpensAt = new TimeOnly(6, 30),
            ClosesAt = d == DayOfWeek.Saturday ? new TimeOnly(13, 0) : new TimeOnly(18, 0),
            PickupStart = new TimeOnly(7, 0),
            PickupEnd = d == DayOfWeek.Saturday ? new TimeOnly(12, 0) : new TimeOnly(17, 0),
            SlotMinutes = 30,
            MaxOrdersPerSlot = 10,
        }).ToList();

    public async Task<IReadOnlyList<LocationDto>> ListAsync(CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var q = db.Locations.AsNoTracking().Include(l => l.Settings).Include(l => l.ScheduleRules)
            .Where(l => l.TenantId == Ctx.TenantId);
        if (Ctx.LocationIds is { } allowed) q = q.Where(l => allowed.Contains(l.Id));
        var locations = await q.OrderBy(l => l.Name).ToListAsync(ct);
        var ids = locations.Select(l => l.Id).ToList();
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddDays(-1);
        var closures = await db.LocationClosures.AsNoTracking().Where(c => ids.Contains(c.LocationId) && c.Date >= today)
            .OrderBy(c => c.Date).ToListAsync(ct);
        return locations.Select(l => ToDto(l, closures.Where(c => c.LocationId == l.Id))).ToList();
    }

    public async Task<LocationDto> GetAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        Ctx.EnsureLocation(id);
        var location = await LoadAsync(id, false, ct);
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddDays(-1);
        var closures = await db.LocationClosures.AsNoTracking().Where(c => c.LocationId == id && c.Date >= today).OrderBy(c => c.Date).ToListAsync(ct);
        return ToDto(location, closures);
    }

    public async Task<LocationDto> CreateAsync(UpsertLocationRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.LocationsManage);
        await guard.EnsureCanAddLocationAsync(Ctx.TenantId, ct);
        var now = clock.GetUtcNow();
        var location = new BakeryLocation { TenantId = Ctx.TenantId, CreatedAt = now };
        ApplyBasics(location, request, now);
        location.Settings = new LocationSettings { TenantId = Ctx.TenantId, LocationId = location.Id };
        ApplySettings(location.Settings, request.Settings);
        db.Locations.Add(location);
        db.PickupScheduleRules.AddRange(DefaultRules(Ctx.TenantId, location.Id));
        audit.Log(Ctx.TenantId, Ctx.UserId, "location.created", nameof(BakeryLocation), location.Id.ToString(), new { location.Name });
        await db.SaveChangesAsync(ct);
        return await GetAsync(location.Id, ct);
    }

    public async Task<LocationDto> UpdateAsync(Guid id, UpsertLocationRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.LocationsManage);
        Ctx.EnsureLocation(id);
        var location = await LoadAsync(id, true, ct);
        ApplyBasics(location, request, clock.GetUtcNow());
        ApplySettings(location.Settings, request.Settings);
        audit.Log(Ctx.TenantId, Ctx.UserId, "location.updated", nameof(BakeryLocation), id.ToString());
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Ordering policy (cutoffs, notice, horizon). Managers with schedule permission may change it for their locations.</summary>
    public async Task<LocationDto> UpdateSettingsAsync(Guid id, LocationSettingsDto settings, CancellationToken ct)
    {
        Ctx.Require(Permission.PickupScheduleManage);
        Ctx.EnsureLocation(id);
        var location = await LoadAsync(id, true, ct);
        ApplySettings(location.Settings, settings);
        location.UpdatedAt = clock.GetUtcNow();
        audit.Log(Ctx.TenantId, Ctx.UserId, "location.settings_updated", nameof(BakeryLocation), id.ToString());
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<LocationDto> UpdateScheduleAsync(UpdateScheduleRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.PickupScheduleManage);
        Ctx.EnsureLocation(request.LocationId);
        var location = await LoadAsync(request.LocationId, true, ct);
        var existing = await db.PickupScheduleRules.Where(r => r.LocationId == location.Id).ToListAsync(ct);
        foreach (var dto in request.Rules)
        {
            var rule = existing.FirstOrDefault(r => r.DayOfWeek == dto.DayOfWeek);
            if (rule is null)
            {
                rule = new PickupScheduleRule { TenantId = Ctx.TenantId, LocationId = location.Id, DayOfWeek = dto.DayOfWeek };
                db.PickupScheduleRules.Add(rule);
            }
            rule.IsOpen = dto.IsOpen;
            rule.OpensAt = dto.OpensAt;
            rule.ClosesAt = dto.ClosesAt;
            rule.PickupStart = dto.PickupStart;
            rule.PickupEnd = dto.PickupEnd;
            rule.SlotMinutes = dto.SlotMinutes;
            rule.MaxOrdersPerSlot = dto.MaxOrdersPerSlot;
            rule.MaxItemsPerSlot = dto.MaxItemsPerSlot;
        }
        location.UpdatedAt = clock.GetUtcNow();
        // Existing orders keep their booked slot times; schedule changes only affect new reservations.
        audit.Log(Ctx.TenantId, Ctx.UserId, "location.schedule_updated", nameof(BakeryLocation), location.Id.ToString());
        await db.SaveChangesAsync(ct);
        return await GetAsync(location.Id, ct);
    }

    public async Task<LocationDto> AddClosureAsync(Guid locationId, AddClosureRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.PickupScheduleManage);
        Ctx.EnsureLocation(locationId);
        await LoadAsync(locationId, false, ct);
        if (await db.LocationClosures.AnyAsync(c => c.LocationId == locationId && c.Date == request.Date, ct))
            throw new ConflictException("closure_exists", "Für dieses Datum ist bereits eine Schließung eingetragen.");

        var activeOrders = await db.Orders.CountAsync(o => o.LocationId == locationId && o.PickupDate == request.Date &&
            (o.Status == OrderStatus.Confirmed || o.Status == OrderStatus.Preparing || o.Status == OrderStatus.ReadyForPickup), ct);
        if (activeOrders > 0)
            throw new ConflictException("closure_has_orders",
                $"Für diesen Tag bestehen {activeOrders} aktive Reservierung(en). Bitte stornieren Sie diese zuerst bewusst – sie werden nicht automatisch storniert.",
                new Dictionary<string, object?> { ["activeOrders"] = activeOrders });

        db.LocationClosures.Add(new LocationClosure { TenantId = Ctx.TenantId, LocationId = locationId, Date = request.Date, Reason = request.Reason?.Trim() });
        audit.Log(Ctx.TenantId, Ctx.UserId, "location.closure_added", nameof(LocationClosure), locationId.ToString(), new { date = request.Date.ToString("yyyy-MM-dd") });
        await db.SaveChangesAsync(ct);
        return await GetAsync(locationId, ct);
    }

    public async Task<LocationDto> RemoveClosureAsync(Guid locationId, Guid closureId, CancellationToken ct)
    {
        Ctx.Require(Permission.PickupScheduleManage);
        Ctx.EnsureLocation(locationId);
        var closure = await db.LocationClosures.FirstOrDefaultAsync(c => c.Id == closureId && c.LocationId == locationId && c.TenantId == Ctx.TenantId, ct)
            ?? throw new NotFoundException("Schließtag nicht gefunden.");
        db.LocationClosures.Remove(closure);
        await db.SaveChangesAsync(ct);
        return await GetAsync(locationId, ct);
    }

    private async Task<BakeryLocation> LoadAsync(Guid id, bool tracked, CancellationToken ct)
    {
        var q = db.Locations.Include(l => l.Settings).Include(l => l.ScheduleRules).Where(l => l.Id == id && l.TenantId == Ctx.TenantId);
        if (!tracked) q = q.AsNoTracking();
        return await q.FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Standort nicht gefunden.", "location_not_found");
    }

    private static void ApplyBasics(BakeryLocation l, UpsertLocationRequest r, DateTimeOffset now)
    {
        l.Name = r.Name.Trim();
        l.Street = r.Street.Trim();
        l.PostalCode = r.PostalCode.Trim();
        l.City = r.City.Trim();
        l.Country = string.IsNullOrWhiteSpace(r.Country) ? "DE" : r.Country.Trim().ToUpperInvariant();
        l.Phone = string.IsNullOrWhiteSpace(r.Phone) ? null : r.Phone.Trim();
        l.Email = string.IsNullOrWhiteSpace(r.Email) ? null : r.Email.Trim();
        l.IsActive = r.IsActive;
        l.UpdatedAt = now;
    }

    private static void ApplySettings(LocationSettings s, LocationSettingsDto d)
    {
        if (!PickupCalendar.IsValidTimeZone(d.TimeZoneId))
            throw new BusinessRuleException("invalid_time_zone", "Unbekannte Zeitzone.");
        s.TimeZoneId = d.TimeZoneId;
        s.AcceptsOrders = d.AcceptsOrders;
        s.OrderCutoffDaysBefore = d.OrderCutoffDaysBefore;
        s.OrderCutoffTime = d.OrderCutoffTime;
        s.MinAdvanceMinutes = d.MinAdvanceMinutes;
        s.MaxDaysAhead = d.MaxDaysAhead;
        s.CancellationCutoffDaysBefore = d.CancellationCutoffDaysBefore;
        s.CancellationCutoffTime = d.CancellationCutoffTime;
    }

    public static LocationDto ToDto(BakeryLocation l, IEnumerable<LocationClosure> closures) => new(
        l.Id, l.Name, l.Street, l.PostalCode, l.City, l.Country, l.Phone, l.Email, l.IsActive,
        new LocationSettingsDto(l.Settings.TimeZoneId, l.Settings.AcceptsOrders, l.Settings.OrderCutoffDaysBefore, l.Settings.OrderCutoffTime,
            l.Settings.MinAdvanceMinutes, l.Settings.MaxDaysAhead, l.Settings.CancellationCutoffDaysBefore, l.Settings.CancellationCutoffTime),
        l.ScheduleRules.OrderBy(r => ((int)r.DayOfWeek + 6) % 7).Select(r => new ScheduleRuleDto(
            r.DayOfWeek, r.IsOpen, r.OpensAt, r.ClosesAt, r.PickupStart, r.PickupEnd, r.SlotMinutes, r.MaxOrdersPerSlot, r.MaxItemsPerSlot)).ToList(),
        closures.Select(c => new ClosureDto(c.Id, c.Date, c.Reason)).ToList());
}
