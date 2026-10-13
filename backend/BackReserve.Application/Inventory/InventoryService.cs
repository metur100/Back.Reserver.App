using System.Data;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Scheduling;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Inventory;

public sealed record ApplyDefaultsRequest(Guid LocationId, DateOnly Date, bool Overwrite);

/// <summary>
/// Daily stock planning. Planned quantities can never be reduced below what is already committed to orders:
/// the update is a conditional UPDATE, so even a concurrent reservation cannot slip in between check and write.
/// </summary>
public sealed class InventoryService(
    IAppDbContext db, IAdminContextAccessor admin, SubscriptionGuard guard, IAuditLogger audit, IDbErrorClassifier dbErrors, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    private async Task<LocationSchedule> LoadLocationAsync(Guid locationId, CancellationToken ct)
    {
        Ctx.EnsureLocation(locationId);
        var schedule = await LocationScheduleLoader.LoadAsync(db, locationId, ct);
        if (schedule is null || schedule.Location.TenantId != Ctx.TenantId)
            throw new NotFoundException("Standort nicht gefunden.", "location_not_found");
        return schedule;
    }

    public async Task<DailyInventoryDto> GetDailyAsync(Guid locationId, DateOnly date, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        await LoadLocationAsync(locationId, ct);

        var products = await db.Products.AsNoTracking()
            .Where(p => p.TenantId == Ctx.TenantId && !p.IsArchived)
            .OrderBy(p => p.SortOrder).ThenBy(p => p.Name)
            .Select(p => new { p.Id, p.Name, p.IsPublished, CategoryName = p.Category != null ? p.Category.Name : null })
            .ToListAsync(ct);
        var inventories = await db.DailyInventories.AsNoTracking()
            .Where(i => i.TenantId == Ctx.TenantId && i.LocationId == locationId && i.Date == date)
            .ToDictionaryAsync(i => i.ProductId, ct);

        var rows = products.Select(p =>
        {
            if (inventories.TryGetValue(p.Id, out var inv))
                return ToRow(inv, p.Name, p.CategoryName, p.IsPublished);
            return new DailyInventoryRowDto(null, p.Id, p.Name, p.CategoryName, p.IsPublished, 0, 0, 0, 0, 0, 0, 0, false, false);
        }).ToList();

        // Archived products that still have stock records for this day stay visible so commitments are never hidden.
        var archivedWithStock = inventories.Keys.Except(products.Select(p => p.Id)).ToList();
        if (archivedWithStock.Count > 0)
        {
            var archived = await db.Products.AsNoTracking().Where(p => archivedWithStock.Contains(p.Id)).ToListAsync(ct);
            rows.AddRange(archived.Select(p => ToRow(inventories[p.Id], p.Name + " (archiviert)", null, false)));
        }
        return new DailyInventoryDto(locationId, date, rows);
    }

    private static DailyInventoryRowDto ToRow(DailyInventory i, string name, string? category, bool published) => new(
        i.Id, i.ProductId, name, category, published, i.PlannedQuantity, i.SafetyBuffer, i.ReservedQuantity, i.CollectedQuantity,
        i.NoShowQuantity, i.MaxSellable, i.Remaining, i.IsUnavailable, !i.IsUnavailable && StockLevels.IsLow(i.Remaining, i.MaxSellable));

    public async Task<DailyInventoryDto> UpdateDailyAsync(UpdateDailyInventoryRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.InventoryManage);
        var schedule = await LoadLocationAsync(request.LocationId, ct);
        if (request.Date < schedule.Today(clock.GetUtcNow()))
            throw new BusinessRuleException("date_in_past", "Bestände für vergangene Tage können nicht mehr geändert werden.");

        var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var validProducts = await db.Products.AsNoTracking()
            .Where(p => p.TenantId == Ctx.TenantId && productIds.Contains(p.Id) && !p.IsArchived)
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        if (validProducts.Count != productIds.Count)
            throw new BusinessRuleException("invalid_product", "Mindestens ein Produkt existiert nicht oder ist archiviert.");

        var now = clock.GetUtcNow();
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
            var existing = await db.DailyInventories.AsNoTracking()
                .Where(i => i.LocationId == request.LocationId && i.Date == request.Date && productIds.Contains(i.ProductId))
                .ToDictionaryAsync(i => i.ProductId, ct);

            var violations = new List<object>();
            foreach (var item in request.Items.OrderBy(i => existing.TryGetValue(i.ProductId, out var e) ? e.Id : Guid.Empty))
            {
                var planned = item.PlannedQuantity;
                var buffer = item.SafetyBuffer;
                var unavailable = item.IsUnavailable;
                if (existing.TryGetValue(item.ProductId, out var inv))
                {
                    var id = inv.Id;
                    var rows = await db.DailyInventories
                        .Where(i => i.Id == id && planned - buffer >= i.ReservedQuantity + i.CollectedQuantity + i.NoShowQuantity)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(i => i.PlannedQuantity, planned)
                            .SetProperty(i => i.SafetyBuffer, buffer)
                            .SetProperty(i => i.IsUnavailable, unavailable)
                            .SetProperty(i => i.UpdatedAt, now), ct);
                    if (rows == 0)
                    {
                        var committed = await db.DailyInventories.Where(i => i.Id == id)
                            .Select(i => i.ReservedQuantity + i.CollectedQuantity + i.NoShowQuantity).FirstAsync(ct);
                        violations.Add(new { productId = item.ProductId, productName = validProducts[item.ProductId], committed, requested = planned - buffer });
                    }
                }
                else if (planned > 0 || unavailable)
                {
                    db.DailyInventories.Add(new DailyInventory
                    {
                        TenantId = Ctx.TenantId, LocationId = request.LocationId, ProductId = item.ProductId, Date = request.Date,
                        PlannedQuantity = planned, SafetyBuffer = buffer, IsUnavailable = unavailable, UpdatedAt = now,
                    });
                }
            }

            if (violations.Count > 0)
            {
                await tx.RollbackAsync(ct);
                throw new ConflictException("quantity_below_reservations",
                    "Die Menge kann nicht unter die bereits reservierte Menge gesenkt werden. Bestehende Reservierungen werden nie automatisch storniert.",
                    new Dictionary<string, object?> { ["violations"] = violations });
            }

            audit.Log(Ctx.TenantId, Ctx.UserId, "inventory.updated", nameof(DailyInventory), null,
                new { request.LocationId, date = request.Date.ToString("yyyy-MM-dd"), items = request.Items.Count });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex) when (dbErrors.IsUniqueViolation(ex))
        {
            db.ChangeTracker.Clear();
            throw new ConflictException("inventory_modified_concurrently", "Die Bestände wurden gleichzeitig geändert. Bitte neu laden und erneut speichern.");
        }
        return await GetDailyAsync(request.LocationId, request.Date, ct);
    }

    public async Task<CopyDayResult> CopyDayAsync(CopyDayRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.InventoryManage);
        await guard.EnsureFeatureAsync(Ctx.TenantId, PlanFeature.ProductionPlanning, ct);
        var schedule = await LoadLocationAsync(request.LocationId, ct);
        if (request.TargetDate < schedule.Today(clock.GetUtcNow()))
            throw new BusinessRuleException("date_in_past", "Das Zieldatum liegt in der Vergangenheit.");
        if (request.SourceDate == request.TargetDate)
            throw new BusinessRuleException("same_date", "Quell- und Zieldatum dürfen nicht gleich sein.");

        var source = await db.DailyInventories.AsNoTracking()
            .Where(i => i.LocationId == request.LocationId && i.Date == request.SourceDate && !i.Product.IsArchived)
            .Select(i => new { i.ProductId, i.PlannedQuantity, i.SafetyBuffer, i.Product.Name })
            .ToListAsync(ct);
        var items = source.Select(s => new DailyInventoryItemRequest(s.ProductId, s.PlannedQuantity, s.SafetyBuffer, false)).ToList();
        return await ApplyAsync(request.LocationId, request.TargetDate, items, source.ToDictionary(s => s.ProductId, s => s.Name), request.Overwrite, "inventory.copied", ct);
    }

    public async Task<CopyDayResult> ApplyDefaultsAsync(ApplyDefaultsRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.InventoryManage);
        var schedule = await LoadLocationAsync(request.LocationId, ct);
        if (request.Date < schedule.Today(clock.GetUtcNow()))
            throw new BusinessRuleException("date_in_past", "Das Datum liegt in der Vergangenheit.");
        var products = await db.Products.AsNoTracking()
            .Where(p => p.TenantId == Ctx.TenantId && !p.IsArchived && p.DefaultDailyQuantity != null && p.DefaultDailyQuantity > 0)
            .Select(p => new { p.Id, p.Name, Qty = p.DefaultDailyQuantity!.Value })
            .ToListAsync(ct);
        var items = products.Select(p => new DailyInventoryItemRequest(p.Id, p.Qty, 0, false)).ToList();
        return await ApplyAsync(request.LocationId, request.Date, items, products.ToDictionary(p => p.Id, p => p.Name), request.Overwrite, "inventory.defaults_applied", ct);
    }

    private async Task<CopyDayResult> ApplyAsync(Guid locationId, DateOnly date, IReadOnlyList<DailyInventoryItemRequest> items,
        IReadOnlyDictionary<Guid, string> names, bool overwrite, string auditAction, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        int created = 0, updated = 0, skipped = 0;
        var warnings = new List<string>();
        var existing = await db.DailyInventories.AsNoTracking()
            .Where(i => i.LocationId == locationId && i.Date == date)
            .ToDictionaryAsync(i => i.ProductId, ct);

        foreach (var item in items)
        {
            if (existing.TryGetValue(item.ProductId, out var inv))
            {
                if (!overwrite) { skipped++; continue; }
                var id = inv.Id;
                var planned = item.PlannedQuantity;
                var buffer = item.SafetyBuffer;
                var rows = await db.DailyInventories
                    .Where(i => i.Id == id && planned - buffer >= i.ReservedQuantity + i.CollectedQuantity + i.NoShowQuantity)
                    .ExecuteUpdateAsync(s => s.SetProperty(i => i.PlannedQuantity, planned).SetProperty(i => i.SafetyBuffer, buffer)
                        .SetProperty(i => i.UpdatedAt, now), ct);
                if (rows == 1) updated++;
                else
                {
                    skipped++;
                    warnings.Add($"„{names[item.ProductId]}“: bereits mehr reserviert als die neue Menge – unverändert gelassen.");
                }
            }
            else
            {
                db.DailyInventories.Add(new DailyInventory
                {
                    TenantId = Ctx.TenantId, LocationId = locationId, ProductId = item.ProductId, Date = date,
                    PlannedQuantity = item.PlannedQuantity, SafetyBuffer = item.SafetyBuffer, UpdatedAt = now,
                });
                created++;
            }
        }
        audit.Log(Ctx.TenantId, Ctx.UserId, auditAction, nameof(DailyInventory), null,
            new { locationId, date = date.ToString("yyyy-MM-dd"), created, updated, skipped });
        try { await db.SaveChangesAsync(ct); }
        catch (Exception ex) when (dbErrors.IsUniqueViolation(ex))
        {
            db.ChangeTracker.Clear();
            throw new ConflictException("inventory_modified_concurrently", "Die Bestände wurden gleichzeitig geändert. Bitte erneut versuchen.");
        }
        return new CopyDayResult(created, updated, skipped, warnings);
    }

    public async Task<ProductionOverviewDto> GetProductionOverviewAsync(Guid locationId, DateOnly date, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        await guard.EnsureFeatureAsync(Ctx.TenantId, PlanFeature.ProductionPlanning, ct);
        var schedule = await LoadLocationAsync(locationId, ct);

        var inventories = await db.DailyInventories.AsNoTracking()
            .Where(i => i.TenantId == Ctx.TenantId && i.LocationId == locationId && i.Date == date)
            .Select(i => new { Inventory = i, i.Product.Name, i.Product.SortOrder })
            .ToListAsync(ct);

        // Quantities per slot from non-cancelled orders (active + collected + no-show = everything that must be produced).
        var bySlot = await db.OrderItems.AsNoTracking()
            .Where(i => i.TenantId == Ctx.TenantId)
            .Join(db.Orders.Where(o => o.LocationId == locationId && o.PickupDate == date && o.Status != OrderStatus.Cancelled),
                i => i.OrderId, o => o.Id, (i, o) => new { i.ProductId, o.SlotStart, i.Quantity })
            .GroupBy(x => new { x.ProductId, x.SlotStart })
            .Select(g => new { g.Key.ProductId, g.Key.SlotStart, Quantity = g.Sum(x => x.Quantity) })
            .ToListAsync(ct);

        var products = inventories.OrderBy(r => r.SortOrder).ThenBy(r => r.Name).Select(r => new ProductionProductDto(
            r.Inventory.ProductId, r.Name, r.Inventory.PlannedQuantity, r.Inventory.SafetyBuffer, r.Inventory.ReservedQuantity,
            r.Inventory.CollectedQuantity, r.Inventory.Remaining, r.Inventory.IsUnavailable,
            !r.Inventory.IsUnavailable && StockLevels.IsLow(r.Inventory.Remaining, r.Inventory.MaxSellable),
            bySlot.Where(s => s.ProductId == r.Inventory.ProductId).OrderBy(s => s.SlotStart)
                .Select(s => new ProductionSlotQuantityDto(s.SlotStart, s.Quantity)).ToList())).ToList();

        var counters = await db.PickupSlotCounters.AsNoTracking()
            .Where(c => c.LocationId == locationId && c.Date == date).ToDictionaryAsync(c => c.SlotStart, ct);
        var rule = schedule.RuleFor(date);
        var slots = schedule.SlotsFor(date).Select(s => new ProductionSlotDto(
            s.Start, s.End, counters.TryGetValue(s.Start, out var c) ? c.OrderCount : 0, c?.ItemCount ?? 0, rule?.MaxOrdersPerSlot)).ToList();

        return new ProductionOverviewDto(locationId, date, products, slots);
    }
}
