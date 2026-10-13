using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Orders;

public sealed class AdminOrderService(
    IAppDbContext db, IAdminContextAccessor admin, OrderLifecycleService lifecycle, IAuditLogger audit, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    /// <summary>Orders of the current tenant restricted to the locations the user may access.</summary>
    private IQueryable<Order> ScopedOrders()
    {
        var q = db.Orders.AsNoTracking().Where(o => o.TenantId == Ctx.TenantId);
        if (Ctx.LocationIds is { } allowed) q = q.Where(o => allowed.Contains(o.LocationId));
        return q;
    }

    public async Task<PagedResult<OrderListItemDto>> ListAsync(OrderQuery query, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var q = ScopedOrders();
        if (query.LocationId is { } locationId)
        {
            Ctx.EnsureLocation(locationId);
            q = q.Where(o => o.LocationId == locationId);
        }
        if (query.DateFrom is { } from) q = q.Where(o => o.PickupDate >= from);
        if (query.DateTo is { } to) q = q.Where(o => o.PickupDate <= to);
        if (query.Status is { Length: > 0 } statuses) q = q.Where(o => statuses.Contains(o.Status));
        if (query.SlotStart is { } slot) q = q.Where(o => o.SlotStart == slot);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            var reference = Codes.NormalizeReference(term);
            // Searching by customer name requires permission to see customer data.
            q = Ctx.Has(Permission.CustomerContactView)
                ? q.Where(o => o.PublicReference == reference || o.PublicReference.Contains(term.ToUpper())
                               || o.Customer.FirstName.Contains(term) || (o.Customer.LastName != null && o.Customer.LastName.Contains(term)))
                : q.Where(o => o.PublicReference == reference || o.PublicReference.Contains(term.ToUpper()));
        }

        var page = new PageQuery(query.Page, query.PageSize);
        var total = await q.CountAsync(ct);
        var items = await q
            .OrderBy(o => o.PickupDate).ThenBy(o => o.SlotStart).ThenBy(o => o.CreatedAt)
            .Skip(page.Skip).Take(page.SafePageSize)
            .Select(ListProjection)
            .ToListAsync(ct);
        return new PagedResult<OrderListItemDto>(items, page.SafePage, page.SafePageSize, total);
    }

    internal static readonly System.Linq.Expressions.Expression<Func<Order, OrderListItemDto>> ListProjection = o =>
        new OrderListItemDto(
            o.Id, o.PublicReference, o.LocationId, o.Location.Name, o.PickupDate, o.SlotStart, o.SlotEnd, o.Status,
            o.Customer.AnonymizedAt != null ? "Anonymisiert" : (o.Customer.LastName == null ? o.Customer.FirstName : o.Customer.FirstName + " " + o.Customer.LastName),
            o.ItemCount, o.Total, o.Currency, o.CustomerNote != null, o.CreatedAt);

    public async Task<OrderDetailDto> GetAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var order = await ScopedOrders().FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new NotFoundException("Bestellung nicht gefunden.", "order_not_found");
        return await ToDetailAsync(order, ct);
    }

    /// <summary>Pickup lookup by code or QR content. Only finds orders of the caller's tenant and permitted locations.</summary>
    public async Task<OrderDetailDto> LookupByReferenceAsync(string code, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var reference = Codes.NormalizeReference(code);
        var order = await ScopedOrders().FirstOrDefaultAsync(o => o.PublicReference == reference, ct)
            ?? throw new NotFoundException("Kein Auftrag mit diesem Abholcode gefunden.", "order_not_found");
        return await ToDetailAsync(order, ct);
    }

    public async Task<OrderDetailDto> ChangeStatusAsync(Guid id, OrderStatus to, string? reason, CancellationToken ct)
    {
        var required = to switch
        {
            OrderStatus.Preparing or OrderStatus.ReadyForPickup => Permission.OrdersProcess,
            OrderStatus.Collected => Permission.PickupCollect,
            OrderStatus.Cancelled or OrderStatus.NoShow => Permission.OrdersCancel,
            _ => throw new BusinessRuleException("invalid_status", "Ungültiger Zielstatus."),
        };
        Ctx.Require(required);

        var order = await ScopedOrders().FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new NotFoundException("Bestellung nicht gefunden.", "order_not_found");

        if (to == OrderStatus.NoShow)
        {
            // No-shows are only allowed after the pickup window ended; never set automatically by a late job.
            if (clock.GetUtcNow() < order.PickupEndUtc)
                throw new BusinessRuleException("no_show_too_early", "Eine Bestellung kann erst nach Ende des Abholfensters als nicht abgeholt markiert werden.");
        }
        if (to == OrderStatus.Cancelled && string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("reason_required", "Bitte gib einen Grund für die Stornierung an. Die Kundin bzw. der Kunde wird informiert.");

        await lifecycle.TransitionAsync(order.Id, Ctx.TenantId, to, "Staff", Ctx.UserId, reason, ct);
        var reloaded = await ScopedOrders().FirstAsync(o => o.Id == id, ct);
        return await ToDetailAsync(reloaded, ct);
    }

    /// <summary>
    /// Records a pickup problem (e.g. missing item, customer dispute) on the order without changing its status.
    /// Shows up in the order history, the audit log and as an in-app notification for the team.
    /// </summary>
    public async Task<OrderDetailDto> ReportProblemAsync(Guid id, string note, CancellationToken ct)
    {
        if (!Ctx.Has(Permission.PickupCollect) && !Ctx.Has(Permission.OrdersProcess)) throw new ForbiddenException();
        var order = await ScopedOrders().FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new NotFoundException("Bestellung nicht gefunden.", "order_not_found");
        var text = note.Trim();
        var now = clock.GetUtcNow();
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            TenantId = order.TenantId, OrderId = order.Id, FromStatus = order.Status, ToStatus = order.Status,
            ChangedByUserId = Ctx.UserId, Actor = "Staff", Note = $"Abholproblem: {text}", CreatedAt = now,
        });
        db.Notifications.Add(new Notification
        {
            TenantId = order.TenantId, LocationId = order.LocationId, OrderId = order.Id, Type = NotificationType.PickupProblem,
            Message = $"Abholproblem bei {order.PublicReference} gemeldet.", CreatedAt = now,
        });
        // The free-text note may contain customer details, so only the fact is audited, not the text.
        audit.Log(order.TenantId, Ctx.UserId, "order.pickup_problem", nameof(Order), order.Id.ToString(), new { order.PublicReference });
        await db.SaveChangesAsync(ct);
        return await ToDetailAsync(order, ct);
    }

    private async Task<OrderDetailDto> ToDetailAsync(Order order, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().Where(l => l.Id == order.LocationId).Select(l => l.Name).FirstAsync(ct);
        var customer = await db.CustomerContacts.AsNoTracking().FirstAsync(c => c.Id == order.CustomerContactId, ct);
        var items = await db.OrderItems.AsNoTracking().Where(i => i.OrderId == order.Id).OrderBy(i => i.ProductName)
            .Select(i => new OrderItemDto(i.ProductId, i.ProductName, i.UnitPrice, i.Quantity, i.LineTotal)).ToListAsync(ct);
        var historyRows = await db.OrderStatusHistory.AsNoTracking().Where(h => h.OrderId == order.Id).OrderBy(h => h.CreatedAt).ThenBy(h => h.Id).ToListAsync(ct);
        var userIds = historyRows.Where(h => h.ChangedByUserId != null).Select(h => h.ChangedByUserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => (u.FirstName + " " + u.LastName).Trim(), ct);

        var showContact = Ctx.Has(Permission.CustomerContactView) && customer.AnonymizedAt is null;
        var actions = OrderMapping.AllowedActions(order.Status).Where(a => a switch
        {
            "prepare" or "ready" => Ctx.Has(Permission.OrdersProcess),
            "collect" => Ctx.Has(Permission.PickupCollect),
            "cancel" => Ctx.Has(Permission.OrdersCancel),
            "no-show" => Ctx.Has(Permission.OrdersCancel) && clock.GetUtcNow() >= order.PickupEndUtc,
            _ => false,
        }).ToList();

        return new OrderDetailDto(
            order.Id, order.PublicReference, order.LocationId, location, order.PickupDate, order.SlotStart, order.SlotEnd,
            order.Status, order.PaymentMode, OrderMapping.CustomerDisplayName(customer),
            showContact ? customer.Email : null, showContact ? customer.Phone : null, order.CustomerNote,
            items, order.ItemCount, order.Subtotal, order.Total, order.Currency, order.CreatedAt, order.CollectedAt,
            order.CancelledAt, order.CancellationReason,
            historyRows.Select(h => new OrderHistoryDto(h.FromStatus, h.ToStatus, h.Actor,
                h.ChangedByUserId is { } uid && names.TryGetValue(uid, out var n) ? n : null, h.Note, h.CreatedAt)).ToList(),
            actions);
    }
}
