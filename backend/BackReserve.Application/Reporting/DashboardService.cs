using BackReserve.Application.Abstractions;
using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Orders;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Reporting;

public sealed class DashboardService(IAppDbContext db, IAdminContextAccessor admin, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    private static readonly OrderStatus[] Active = [OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.ReadyForPickup];

    private IQueryable<Order> Scoped(Guid? locationId)
    {
        var q = db.Orders.AsNoTracking().Where(o => o.TenantId == Ctx.TenantId);
        if (locationId is { } id) q = q.Where(o => o.LocationId == id);
        else if (Ctx.LocationIds is { } allowed) q = q.Where(o => allowed.Contains(o.LocationId));
        return q;
    }

    /// <summary>Resolves "today" in the location's time zone (or the first accessible location's zone).</summary>
    internal static async Task<(DateOnly Today, TimeZoneInfo Tz)> TodayAsync(IAppDbContext db, AdminContext ctx, Guid? locationId, TimeProvider clock, CancellationToken ct)
    {
        var q = db.LocationSettings.AsNoTracking().Where(s => s.TenantId == ctx.TenantId);
        if (locationId is { } id) q = q.Where(s => s.LocationId == id);
        else if (ctx.LocationIds is { } allowed) q = q.Where(s => allowed.Contains(s.LocationId));
        var tzId = await q.Select(s => s.TimeZoneId).FirstOrDefaultAsync(ct) ?? "Europe/Berlin";
        var tz = PickupCalendar.ResolveTimeZone(tzId);
        return (PickupCalendar.LocalToday(clock.GetUtcNow(), tz), tz);
    }

    public async Task<DashboardDto> GetAsync(Guid? locationId, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        if (locationId is { } lid) Ctx.EnsureLocation(lid);
        var (today, _) = await TodayAsync(db, Ctx, locationId, clock, ct);
        var tomorrow = today.AddDays(1);

        var orders = Scoped(locationId);
        var dayStats = await orders
            .Where(o => (o.PickupDate == today || o.PickupDate == tomorrow) && o.Status != OrderStatus.Cancelled)
            .GroupBy(o => o.PickupDate)
            .Select(g => new { Date = g.Key, Orders = g.Count(), Items = g.Sum(o => o.ItemCount), Value = g.Sum(o => o.Total) })
            .ToListAsync(ct);
        var t = dayStats.FirstOrDefault(d => d.Date == today);
        var tm = dayStats.FirstOrDefault(d => d.Date == tomorrow);

        var todayStatus = await orders.Where(o => o.PickupDate == today)
            .GroupBy(o => o.Status).Select(g => new { Status = g.Key, Count = g.Count() }).ToListAsync(ct);
        int Count(OrderStatus s) => todayStatus.FirstOrDefault(x => x.Status == s)?.Count ?? 0;

        var schedule = await orders.Where(o => o.PickupDate == today && o.Status != OrderStatus.Cancelled)
            .GroupBy(o => new { o.SlotStart, o.SlotEnd })
            .Select(g => new DashboardSlotDto(g.Key.SlotStart, g.Key.SlotEnd, g.Count(), g.Sum(o => o.ItemCount),
                g.Count(o => o.Status == OrderStatus.Confirmed || o.Status == OrderStatus.Preparing),
                g.Count(o => o.Status == OrderStatus.ReadyForPickup),
                g.Count(o => o.Status == OrderStatus.Collected)))
            .ToListAsync(ct);

        var invQ = db.DailyInventories.AsNoTracking()
            .Where(i => i.TenantId == Ctx.TenantId && (i.Date == today || i.Date == tomorrow) && !i.IsUnavailable && i.PlannedQuantity > 0);
        if (locationId is { } l2) invQ = invQ.Where(i => i.LocationId == l2);
        else if (Ctx.LocationIds is { } allowed) invQ = invQ.Where(i => allowed.Contains(i.LocationId));
        var inventories = await invQ.Select(i => new { Inventory = i, i.Product.Name }).ToListAsync(ct);
        var lowStock = inventories
            .Where(x => x.Inventory.Remaining == 0 || StockLevels.IsLow(x.Inventory.Remaining, x.Inventory.MaxSellable))
            .OrderBy(x => x.Inventory.Date).ThenBy(x => x.Inventory.Remaining)
            .Take(10)
            .Select(x => new LowStockDto(x.Inventory.ProductId, x.Name, x.Inventory.Date, x.Inventory.Remaining, x.Inventory.MaxSellable))
            .ToList();

        var recent = await orders.OrderByDescending(o => o.CreatedAt).Take(8).Select(AdminOrderService.ListProjection).ToListAsync(ct);

        var unreadQ = db.Notifications.Where(n => n.TenantId == Ctx.TenantId && n.ReadAt == null);
        if (Ctx.LocationIds is { } al) unreadQ = unreadQ.Where(n => n.LocationId == null || al.Contains(n.LocationId.Value));
        var unread = await unreadQ.CountAsync(ct);

        var currency = await db.TenantSettings.Where(s => s.TenantId == Ctx.TenantId).Select(s => s.Currency).FirstAsync(ct);

        return new DashboardDto(
            locationId, today, tomorrow,
            t?.Orders ?? 0, tm?.Orders ?? 0, t?.Items ?? 0, tm?.Items ?? 0,
            Count(OrderStatus.ReadyForPickup), Count(OrderStatus.Preparing), Count(OrderStatus.Confirmed),
            t?.Value ?? 0, tm?.Value ?? 0, currency, Count(OrderStatus.Cancelled),
            lowStock, schedule.OrderBy(s => s.SlotStart).ToList(), recent, unread);
    }
}
