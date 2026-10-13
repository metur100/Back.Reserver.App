using System.Data;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Notifications;
using BackReserve.Domain.Common;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BackReserve.Application.Orders;

/// <summary>
/// Applies order status transitions together with their inventory effects in one transaction.
/// The status change is a conditional UPDATE on the expected current status, so of two concurrent requests
/// (double collect, double cancel, cancel vs. collect) exactly one wins and stock is adjusted exactly once.
/// </summary>
public sealed class OrderLifecycleService(
    IAppDbContext db,
    IEmailOutbox outbox,
    IAuditLogger audit,
    IDbErrorClassifier dbErrors,
    TimeProvider clock,
    ILogger<OrderLifecycleService> logger)
{
    private const int MaxAttempts = 4;

    public async Task TransitionAsync(Guid orderId, Guid tenantId, OrderStatus to, string actor, Guid? userId, string? reason, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await TryTransitionAsync(orderId, tenantId, to, actor, userId, reason, ct);
                return;
            }
            catch (Exception ex) when (attempt < MaxAttempts && dbErrors.IsDeadlockOrTransient(ex))
            {
                logger.LogWarning("Order transition attempt {Attempt} hit a transient database error; retrying.", attempt);
                db.ChangeTracker.Clear();
                await Task.Delay(TimeSpan.FromMilliseconds(25 * attempt), ct);
            }
        }
    }

    private async Task TryTransitionAsync(Guid orderId, Guid tenantId, OrderStatus to, string actor, Guid? userId, string? reason, CancellationToken ct)
    {
        var order = await db.Orders.AsNoTracking().Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId && o.TenantId == tenantId, ct)
            ?? throw new NotFoundException("Bestellung nicht gefunden.", "order_not_found");

        var from = order.Status;
        EnsureTransition(from, to);

        var now = clock.GetUtcNow();
        var cancelledBy = actor == "Customer" ? CancellationActor.Customer : CancellationActor.Bakery;
        var trimmedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();

        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);

        var updated = await db.Orders
            .Where(o => o.Id == orderId && o.TenantId == tenantId && o.Status == from)
            .ExecuteUpdateAsync(s =>
            {
                s.SetProperty(o => o.Status, to).SetProperty(o => o.UpdatedAt, now);
                switch (to)
                {
                    case OrderStatus.Preparing: s.SetProperty(o => o.PreparingAt, now); break;
                    case OrderStatus.ReadyForPickup: s.SetProperty(o => o.ReadyAt, now); break;
                    case OrderStatus.Collected:
                        s.SetProperty(o => o.CollectedAt, now).SetProperty(o => o.CollectedByUserId, userId);
                        break;
                    case OrderStatus.Cancelled:
                        s.SetProperty(o => o.CancelledAt, now)
                            .SetProperty(o => o.CancelledBy, cancelledBy)
                            .SetProperty(o => o.CancellationReason, trimmedReason);
                        break;
                    case OrderStatus.NoShow: s.SetProperty(o => o.NoShowAt, now); break;
                }
            }, ct);

        if (updated == 0)
        {
            await tx.RollbackAsync(ct);
            var current = await db.Orders.AsNoTracking().Where(o => o.Id == orderId).Select(o => o.Status).FirstAsync(ct);
            EnsureTransition(current, to); // throws the specific "already collected/cancelled" error
            throw new ConflictException("order_modified_concurrently", "Die Bestellung wurde gerade von jemand anderem geändert. Bitte neu laden.");
        }

        if (OrderStateMachine.IsActive(from) && !OrderStateMachine.IsActive(to))
            await ReleaseOrFulfilStockAsync(order, to, now, ct);

        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            TenantId = tenantId, OrderId = orderId, FromStatus = from, ToStatus = to, ChangedByUserId = userId,
            Actor = actor, Note = trimmedReason, CreatedAt = now,
        });
        if (actor != "Customer")
            audit.Log(tenantId, userId, $"order.{to.ToString().ToLowerInvariant()}", nameof(Order), orderId.ToString(),
                new { order.PublicReference, from = from.ToString(), to = to.ToString() });

        await EnqueueCustomerNotificationsAsync(order, to, actor, trimmedReason, ct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private static void EnsureTransition(OrderStatus from, OrderStatus to)
    {
        try
        {
            OrderStateMachine.EnsureCanTransition(from, to);
        }
        catch (DomainException ex)
        {
            var message = ex.Code switch
            {
                "order_already_collected" => "Diese Bestellung wurde bereits abgeholt.",
                "order_already_cancelled" => "Diese Bestellung wurde bereits storniert.",
                "order_cancelled" => "Diese Bestellung wurde storniert und kann nicht mehr bearbeitet werden.",
                _ => "Dieser Statuswechsel ist für die Bestellung nicht möglich.",
            };
            throw new ConflictException(ex.Code, message, new Dictionary<string, object?> { ["currentStatus"] = from.ToString() });
        }
    }

    /// <summary>
    /// Cancelled: reserved units return to sale and slot capacity is freed.
    /// Collected: reserved units become collected (still committed, never sellable again).
    /// NoShow: reserved units become no-show (committed; the goods were produced).
    /// </summary>
    private async Task ReleaseOrFulfilStockAsync(Order order, OrderStatus to, DateTimeOffset now, CancellationToken ct)
    {
        if (to == OrderStatus.Cancelled)
        {
            var itemCount = order.ItemCount;
            var date = order.PickupDate;
            var slotStart = order.SlotStart;
            var locationId = order.LocationId;
            await db.PickupSlotCounters
                .Where(c => c.LocationId == locationId && c.Date == date && c.SlotStart == slotStart && c.OrderCount >= 1)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.OrderCount, c => c.OrderCount - 1)
                    .SetProperty(c => c.ItemCount, c => c.ItemCount >= itemCount ? c.ItemCount - itemCount : 0), ct);
        }

        foreach (var item in order.Items.OrderBy(i => i.DailyInventoryId))
        {
            var qty = item.Quantity;
            var inventoryId = item.DailyInventoryId;
            var query = db.DailyInventories.Where(i => i.Id == inventoryId && i.ReservedQuantity >= qty);
            var rows = to switch
            {
                OrderStatus.Cancelled => await query.ExecuteUpdateAsync(s => s
                    .SetProperty(i => i.ReservedQuantity, i => i.ReservedQuantity - qty)
                    .SetProperty(i => i.UpdatedAt, now), ct),
                OrderStatus.Collected => await query.ExecuteUpdateAsync(s => s
                    .SetProperty(i => i.ReservedQuantity, i => i.ReservedQuantity - qty)
                    .SetProperty(i => i.CollectedQuantity, i => i.CollectedQuantity + qty)
                    .SetProperty(i => i.UpdatedAt, now), ct),
                OrderStatus.NoShow => await query.ExecuteUpdateAsync(s => s
                    .SetProperty(i => i.ReservedQuantity, i => i.ReservedQuantity - qty)
                    .SetProperty(i => i.NoShowQuantity, i => i.NoShowQuantity + qty)
                    .SetProperty(i => i.UpdatedAt, now), ct),
                _ => 1,
            };
            if (rows != 1)
            {
                // Counters disagree with order lines. Abort instead of silently corrupting stock; reconciliation job reports it.
                logger.LogError("Inventory counter mismatch for inventory {InventoryId} while moving order {OrderId} to {Status}.",
                    inventoryId, order.Id, to);
                throw new InvalidOperationException("Inventory counters are inconsistent with order lines.");
            }
        }
    }

    private async Task EnqueueCustomerNotificationsAsync(Order order, OrderStatus to, string actor, string? reason, CancellationToken ct)
    {
        var sendReady = to == OrderStatus.ReadyForPickup;
        var sendCancelled = to == OrderStatus.Cancelled;
        if (!sendReady && !sendCancelled) return;

        var tenant = await db.Tenants.AsNoTracking().Include(t => t.Settings).Include(t => t.Subscription!).ThenInclude(s => s.Plan)
            .FirstAsync(t => t.Id == order.TenantId, ct);
        if (sendReady && (!tenant.Settings.SendReadyNotification || tenant.Subscription?.Plan.EmailNotifications == false)) return;

        var customer = await db.CustomerContacts.AsNoTracking().FirstAsync(c => c.Id == order.CustomerContactId, ct);
        if (customer.AnonymizedAt is not null) return;
        var location = await db.Locations.AsNoTracking().Include(l => l.Settings).FirstAsync(l => l.Id == order.LocationId, ct);
        var model = EmailTemplates.BuildModel(order, tenant, location, location.Settings, order.Items, null);

        if (sendCancelled)
        {
            outbox.Enqueue(EmailTemplates.OrderCancelled(customer.Email, model, actor != "Customer", reason));
            if (actor == "Customer")
            {
                db.Notifications.Add(new Notification
                {
                    TenantId = order.TenantId, LocationId = order.LocationId, OrderId = order.Id,
                    Type = NotificationType.OrderCancelledByCustomer,
                    Message = $"Reservierung {order.PublicReference} wurde vom Kunden storniert.",
                    CreatedAt = clock.GetUtcNow(),
                });
            }
        }
        else
        {
            outbox.Enqueue(EmailTemplates.OrderReady(customer.Email, model));
        }
    }
}
