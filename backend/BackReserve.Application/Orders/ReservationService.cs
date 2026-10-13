using System.Data;
using System.Text.Json;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Notifications;
using BackReserve.Application.Payments;
using BackReserve.Application.Scheduling;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BackReserve.Application.Orders;

/// <summary>
/// Creates guest reservations. Stock and slot capacity are reserved with single conditional UPDATE statements
/// inside one transaction, so concurrent requests can never oversell (see docs/ARCHITECTURE.md, "Reservation concurrency").
/// </summary>
public sealed class ReservationService(
    IAppDbContext db,
    PublicCatalogService catalog,
    ISlotCounterStore slotStore,
    IDbErrorClassifier dbErrors,
    IEmailOutbox outbox,
    IPayloadProtector protector,
    OrderLifecycleService lifecycle,
    IPaymentGateway payments,
    IOptions<AppUrlOptions> urls,
    TimeProvider clock,
    ILogger<ReservationService> logger)
{
    public static readonly TimeSpan IdempotencyRetention = TimeSpan.FromHours(24);
    private const int MaxAttempts = 4;

    private sealed record Line(Product Product, DailyInventory Inventory, int Quantity, decimal UnitPrice, decimal LineTotal);

    public async Task<CreateOrderResponse> CreateAsync(CreateOrderRequest request, string? idempotencyKey, CancellationToken ct)
    {
        var requestHash = Codes.Sha256(JsonSerializer.Serialize(request));
        if (idempotencyKey is not null && await TryReplayAsync(idempotencyKey, requestHash, ct) is { } replay)
            return replay;

        var schedule = await catalog.GetVisibleLocationScheduleAsync(request.LocationId, ct);
        var tenantId = schedule.Location.TenantId;
        var tenant = await db.Tenants.AsNoTracking().Include(t => t.Settings).FirstAsync(t => t.Id == tenantId, ct);

        if (tenant.Settings.RequireCustomerLastName && string.IsNullOrWhiteSpace(request.Customer.LastName))
            throw new BusinessRuleException("last_name_required", "Bitte gib deinen Nachnamen an.");
        if (tenant.Settings.RequireCustomerPhone && string.IsNullOrWhiteSpace(request.Customer.Phone))
            throw new BusinessRuleException("phone_required", "Bitte gib deine Telefonnummer an.");

        var now = clock.GetUtcNow();
        var dateAvailability = schedule.CheckDate(request.PickupDate, now);
        if (dateAvailability != DateAvailability.Open)
            throw new BusinessRuleException("pickup_date_unavailable", LocationSchedule.GermanMessage(dateAvailability),
                new Dictionary<string, object?> { ["reason"] = LocationSchedule.StatusCode(dateAvailability) });

        var rule = schedule.RuleFor(request.PickupDate)!;
        var slot = schedule.SlotsFor(request.PickupDate).FirstOrDefault(s => s.Start == request.SlotStart)
            ?? throw new BusinessRuleException("invalid_slot", "Dieses Abholzeitfenster gibt es an diesem Tag nicht.");

        var quantities = request.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var productIds = quantities.Keys.ToList();

        // Prices, publication state and ownership always come from the database, never from the client.
        var products = await db.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && productIds.Contains(p.Id) && p.IsPublished && !p.IsArchived)
            .ToListAsync(ct);
        if (products.Count != productIds.Count)
            throw new BusinessRuleException("product_unavailable", "Mindestens ein Produkt ist nicht mehr verfügbar. Bitte prüfe deinen Warenkorb.",
                new Dictionary<string, object?> { ["productIds"] = productIds.Except(products.Select(p => p.Id)).ToList() });

        var maxLeadTime = products.Max(p => p.LeadTimeHours);
        if (!PickupCalendar.IsSlotTimeEligible(slot, schedule.Settings, now, maxLeadTime))
            throw new BusinessRuleException("slot_too_soon", "Dieses Abholzeitfenster ist für deine Auswahl nicht mehr buchbar. Bitte wähle eine spätere Zeit.");

        var inventories = await db.DailyInventories.AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.LocationId == request.LocationId && i.Date == request.PickupDate && productIds.Contains(i.ProductId))
            .ToDictionaryAsync(i => i.ProductId, ct);
        var missing = productIds.Where(id => !inventories.ContainsKey(id)).ToList();
        if (missing.Count > 0)
            throw new ConflictException("product_not_available_on_date", "Mindestens ein Produkt ist für dieses Datum nicht verfügbar.",
                new Dictionary<string, object?> { ["productIds"] = missing });

        var lines = products.Select(p =>
        {
            var qty = quantities[p.Id];
            return new Line(p, inventories[p.Id], qty, p.BasePrice, Codes.RoundMoney(p.BasePrice * qty));
        }).ToList();

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await ReserveAsync(request, idempotencyKey, requestHash, tenant, schedule, rule, slot, lines, ct);
            }
            catch (Exception ex) when (attempt < MaxAttempts && dbErrors.IsDeadlockOrTransient(ex))
            {
                logger.LogWarning("Reservation attempt {Attempt} hit a transient database error; retrying.", attempt);
                db.ChangeTracker.Clear();
                await Task.Delay(TimeSpan.FromMilliseconds(25 * attempt * Random.Shared.Next(1, 4)), ct);
            }
            catch (Exception ex) when (attempt < MaxAttempts && dbErrors.IsUniqueViolation(ex, "IX_Orders_PublicReference"))
            {
                db.ChangeTracker.Clear(); // astronomically rare reference collision: generate a new one
            }
            catch (Exception ex) when (idempotencyKey is not null && dbErrors.IsUniqueViolation(ex, "IX_IdempotencyRecords_Key"))
            {
                // A concurrent duplicate submission with the same key won the race; return its result.
                db.ChangeTracker.Clear();
                return await TryReplayAsync(idempotencyKey, requestHash, ct)
                    ?? throw new ConflictException("duplicate_request", "Diese Bestellung wird bereits verarbeitet.");
            }
        }
    }

    private async Task<CreateOrderResponse> ReserveAsync(
        CreateOrderRequest request, string? idempotencyKey, string requestHash, Tenant tenant, LocationSchedule schedule,
        PickupScheduleRule rule, SlotDefinition slot, IReadOnlyList<Line> lines, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var tenantId = tenant.Id;
        var locationId = request.LocationId;
        var date = request.PickupDate;
        var itemCount = lines.Sum(l => l.Quantity);

        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);

        // 1) Slot capacity: lock order is always slot counter -> inventory rows (sorted) to avoid deadlocks.
        await slotStore.EnsureRowAsync(tenantId, locationId, date, slot.Start, ct);
        var maxOrders = rule.MaxOrdersPerSlot;
        var maxItems = rule.MaxItemsPerSlot;
        var slotStart = slot.Start;
        var slotReserved = await db.PickupSlotCounters
            .Where(c => c.LocationId == locationId && c.Date == date && c.SlotStart == slotStart
                        && c.OrderCount < maxOrders && (maxItems == null || c.ItemCount + itemCount <= maxItems))
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.OrderCount, c => c.OrderCount + 1)
                .SetProperty(c => c.ItemCount, c => c.ItemCount + itemCount), ct);
        if (slotReserved == 0)
        {
            await tx.RollbackAsync(ct);
            throw new ConflictException("slot_full", "Dieses Abholzeitfenster ist leider ausgebucht. Bitte wähle eine andere Zeit.");
        }

        // 2) Stock: atomic conditional increment. A naive read-then-write check would oversell under concurrency.
        foreach (var line in lines.OrderBy(l => l.Inventory.Id))
        {
            var inventoryId = line.Inventory.Id;
            var qty = line.Quantity;
            var reserved = await db.DailyInventories
                .Where(i => i.Id == inventoryId && !i.IsUnavailable
                            && i.PlannedQuantity - i.SafetyBuffer - i.ReservedQuantity - i.CollectedQuantity - i.NoShowQuantity >= qty)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(i => i.ReservedQuantity, i => i.ReservedQuantity + qty)
                    .SetProperty(i => i.UpdatedAt, now), ct);
            if (reserved == 0)
            {
                await tx.RollbackAsync(ct);
                var current = await db.DailyInventories.AsNoTracking().FirstAsync(i => i.Id == inventoryId, ct);
                var remaining = current.Remaining;
                throw new ConflictException("insufficient_stock",
                    remaining == 0
                        ? $"„{line.Product.Name}“ ist für diesen Tag leider ausverkauft."
                        : $"Von „{line.Product.Name}“ sind nur noch {remaining} Stück verfügbar.",
                    new Dictionary<string, object?> { ["productId"] = line.Product.Id, ["remaining"] = remaining });
            }
        }

        // 3) Persist order with snapshotted names and prices.
        var accessToken = Codes.NewSecureToken();
        var customer = new CustomerContact
        {
            TenantId = tenantId,
            FirstName = request.Customer.FirstName.Trim(),
            LastName = string.IsNullOrWhiteSpace(request.Customer.LastName) ? null : request.Customer.LastName.Trim(),
            Email = request.Customer.Email.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Customer.Phone) ? null : request.Customer.Phone.Trim(),
            CreatedAt = now,
        };
        var subtotal = lines.Sum(l => l.LineTotal);
        var order = new Order
        {
            TenantId = tenantId,
            LocationId = locationId,
            PublicReference = Codes.NewPublicReference(),
            AccessTokenHash = Codes.Sha256(accessToken),
            CustomerContactId = customer.Id,
            PickupDate = date,
            SlotStart = slot.Start,
            SlotEnd = slot.End,
            PickupStartUtc = slot.StartUtc,
            PickupEndUtc = slot.EndUtc,
            Status = OrderStatus.Confirmed,
            PaymentMode = payments.Mode,
            Subtotal = subtotal,
            Total = subtotal,
            Currency = tenant.Settings.Currency,
            ItemCount = itemCount,
            CustomerNote = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        var items = lines.Select(l => new OrderItem
        {
            TenantId = tenantId,
            OrderId = order.Id,
            ProductId = l.Product.Id,
            DailyInventoryId = l.Inventory.Id,
            ProductName = l.Product.Name,
            UnitPrice = l.UnitPrice,
            Quantity = l.Quantity,
            LineTotal = l.LineTotal,
        }).ToList();

        db.CustomerContacts.Add(customer);
        db.Orders.Add(order);
        db.OrderItems.AddRange(items);
        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            TenantId = tenantId, OrderId = order.Id, FromStatus = null, ToStatus = OrderStatus.Confirmed, Actor = "Customer", CreatedAt = now,
        });
        db.Notifications.Add(new Notification
        {
            TenantId = tenantId,
            LocationId = locationId,
            OrderId = order.Id,
            Type = NotificationType.NewOrder,
            Message = $"Neue Reservierung {order.PublicReference} für {EmailTemplates.Date(date)}, {EmailTemplates.Time(slot.Start)} Uhr",
            CreatedAt = now,
        });

        var statusLink = OrderMapping.StatusLink(urls.Value.WebBaseUrl, order.PublicReference, accessToken);
        var payment = await payments.InitiateAsync(order, ct);
        if (payment.Mode != PaymentMode.PayAtPickup || payment.IsPaid)
            throw new InvalidOperationException("Only pay-at-pickup is supported until online payment is implemented.");

        outbox.Enqueue(EmailTemplates.OrderConfirmed(customer.Email,
            EmailTemplates.BuildModel(order, tenant, schedule.Location, schedule.Settings, items, statusLink)));

        var response = new CreateOrderResponse(
            OrderMapping.ToPublicDto(order, tenant, schedule.Location, schedule.Settings, customer, items, now), accessToken);

        if (idempotencyKey is not null)
        {
            db.IdempotencyRecords.Add(new ReservationIdempotencyRecord
            {
                Key = idempotencyKey,
                RequestHash = requestHash,
                OrderId = order.Id,
                ProtectedResponse = protector.Protect(JsonSerializer.Serialize(response)),
                CreatedAt = now,
                ExpiresAt = now + IdempotencyRetention,
            });
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        logger.LogInformation("Reservation {Reference} created for tenant {TenantId}, location {LocationId}, {Items} items.",
            order.PublicReference, tenantId, locationId, itemCount);
        return response;
    }

    private async Task<CreateOrderResponse?> TryReplayAsync(string key, string requestHash, CancellationToken ct)
    {
        var record = await db.IdempotencyRecords.AsNoTracking().FirstOrDefaultAsync(r => r.Key == key, ct);
        if (record is null) return null;
        if (record.RequestHash != requestHash)
            throw new BusinessRuleException("idempotency_key_reused", "Dieser Idempotency-Key wurde bereits für eine andere Anfrage verwendet.");

        var original = JsonSerializer.Deserialize<CreateOrderResponse>(protector.Unprotect(record.ProtectedResponse))!;
        // Return the current state of the order (it may have changed since) with the original access token.
        var current = await GetAsync(original.Order.PublicReference, original.AccessToken, ct);
        return original with { Order = current };
    }

    /// <summary>Customer order view. Requires the capability token; a wrong token is indistinguishable from an unknown reference.</summary>
    public async Task<PublicOrderDto> GetAsync(string publicReference, string? accessToken, CancellationToken ct)
    {
        var order = await LoadAuthorizedAsync(publicReference, accessToken, ct);
        return await ToPublicDtoAsync(order, ct);
    }

    public async Task<PublicOrderDto> CancelAsync(string publicReference, string? accessToken, CancellationToken ct)
    {
        var order = await LoadAuthorizedAsync(publicReference, accessToken, ct);
        if (order.Status == OrderStatus.Cancelled) return await ToPublicDtoAsync(order, ct); // idempotent

        var settings = await db.LocationSettings.AsNoTracking().FirstAsync(s => s.LocationId == order.LocationId, ct);
        var deadline = PickupCalendar.CancellationCutoffUtc(order.PickupDate, settings, PickupCalendar.ResolveTimeZone(settings.TimeZoneId));
        if (!order.IsActive)
            throw new ConflictException("order_not_cancellable", "Diese Bestellung kann nicht mehr storniert werden.");
        if (clock.GetUtcNow() >= deadline)
            throw new BusinessRuleException("cancellation_window_closed",
                "Die Stornierungsfrist ist abgelaufen. Bitte wende dich direkt an die Bäckerei.");

        try
        {
            await lifecycle.TransitionAsync(order.Id, order.TenantId, OrderStatus.Cancelled, "Customer", null, null, ct);
        }
        catch (ConflictException ex) when (ex.Code == "order_already_cancelled")
        {
            // Concurrent duplicate cancellation: stock was restored exactly once by the winner.
        }

        var reloaded = await db.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        return await ToPublicDtoAsync(reloaded, ct);
    }

    private async Task<Order> LoadAuthorizedAsync(string publicReference, string? accessToken, CancellationToken ct)
    {
        var notFound = new NotFoundException("Diese Bestellung wurde nicht gefunden oder der Link ist ungültig.", "order_not_found");
        if (string.IsNullOrWhiteSpace(accessToken) || accessToken.Length > 128) throw notFound;
        var reference = Codes.NormalizeReference(publicReference);
        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.PublicReference == reference, ct);
        if (order is null || !Codes.FixedTimeEqualsHash(accessToken, order.AccessTokenHash)) throw notFound;
        return order;
    }

    private async Task<PublicOrderDto> ToPublicDtoAsync(Order order, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().Include(t => t.Settings).FirstAsync(t => t.Id == order.TenantId, ct);
        var location = await db.Locations.AsNoTracking().Include(l => l.Settings).FirstAsync(l => l.Id == order.LocationId, ct);
        var customer = await db.CustomerContacts.AsNoTracking().FirstAsync(c => c.Id == order.CustomerContactId, ct);
        var items = await db.OrderItems.AsNoTracking().Where(i => i.OrderId == order.Id).OrderBy(i => i.ProductName).ToListAsync(ct);
        return OrderMapping.ToPublicDto(order, tenant, location, location.Settings, customer, items, clock.GetUtcNow());
    }
}
