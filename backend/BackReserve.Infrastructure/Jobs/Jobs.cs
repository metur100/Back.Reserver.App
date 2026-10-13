using System.Text.Json;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Notifications;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Infrastructure.Email;
using BackReserve.Infrastructure.Persistence;
using BackReserve.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BackReserve.Infrastructure.Jobs;

public sealed class JobOptions
{
    public const string Section = "Jobs";
    /// <summary>Runs the in-process workers. Requires an always-on host (see docs/OPERATIONS.md).</summary>
    public bool Enabled { get; set; } = true;
    public int OutboxIntervalSeconds { get; set; } = 10;
    public int MaintenanceIntervalSeconds { get; set; } = 300;
    public int MaxOutboxAttempts { get; set; } = 8;
    public bool RetentionEnabled { get; set; } = true;
    public bool RemindersEnabled { get; set; } = true;
}

/// <summary>
/// Delivers outbox messages. Rows are claimed with UPDATE ... WITH (READPAST, UPDLOCK) so several API instances can
/// run the dispatcher concurrently without sending a message twice. Delivery is at-least-once by nature of SMTP.
/// </summary>
public sealed class OutboxDispatcher(
    AppDbContext db, IEmailSender sender, IPayloadProtector protector, IOptions<JobOptions> options, TimeProvider clock,
    ILogger<OutboxDispatcher> logger)
{
    public async Task<int> DispatchPendingAsync(CancellationToken ct, int batchSize = 20)
    {
        var now = clock.GetUtcNow();
        var lockUntil = now.AddMinutes(2);
        var ids = await db.Database.SqlQuery<Guid>($"""
            UPDATE TOP ({batchSize}) o
            SET [LockedUntil] = {lockUntil}, [Attempts] = [Attempts] + 1
            OUTPUT inserted.[Id] AS [Value]
            FROM [OutboxMessages] o WITH (ROWLOCK, READPAST, UPDLOCK)
            WHERE o.[ProcessedAt] IS NULL AND o.[Failed] = 0 AND o.[NextAttemptAt] <= {now}
              AND (o.[LockedUntil] IS NULL OR o.[LockedUntil] < {now})
            """).ToListAsync(ct);

        foreach (var id in ids)
        {
            var message = await db.OutboxMessages.FirstAsync(m => m.Id == id, ct);
            try
            {
                if (message.Type != EmailOutbox.EmailType) throw new InvalidOperationException($"Unknown outbox type {message.Type}");
                var email = JsonSerializer.Deserialize<EmailMessage>(protector.Unprotect(message.Payload))!;
                await sender.SendAsync(email, ct);
                message.ProcessedAt = clock.GetUtcNow();
                message.LockedUntil = null;
                message.LastError = null;
            }
            catch (EmailNotConfiguredException)
            {
                // Honest state: not delivered because no provider is configured. Not retried, visible in platform health.
                message.ProcessedAt = clock.GetUtcNow();
                message.LastError = "Nicht versendet: kein E-Mail-Anbieter konfiguriert.";
                logger.LogWarning("Outbox message {Id} skipped: no email provider configured.", id);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                message.LockedUntil = null;
                message.LastError = $"{ex.GetType().Name}: {Truncate(ex.Message, 500)}";
                if (message.Attempts >= options.Value.MaxOutboxAttempts)
                {
                    message.Failed = true;
                    logger.LogError(ex, "Outbox message {Id} permanently failed after {Attempts} attempts.", id, message.Attempts);
                }
                else
                {
                    message.NextAttemptAt = clock.GetUtcNow().AddMinutes(Math.Pow(2, message.Attempts));
                    logger.LogWarning(ex, "Outbox message {Id} failed (attempt {Attempts}); will retry.", id, message.Attempts);
                }
            }
            await db.SaveChangesAsync(ct);
        }
        return ids.Count;
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}

/// <summary>Idempotent housekeeping. Every job is safe to run concurrently on several instances and to re-run after a crash.</summary>
public sealed class MaintenanceJobs(
    AppDbContext db, IEmailOutbox outbox, IOptions<JobOptions> options, TimeProvider clock, ILogger<MaintenanceJobs> logger)
{
    public async Task RunAllAsync(CancellationToken ct)
    {
        await CleanupAsync(ct);
        if (options.Value.RemindersEnabled) await SendPickupRemindersAsync(ct);
        if (options.Value.RetentionEnabled) await AnonymizeExpiredCustomerDataAsync(ct);
        await ReconcileInventoryAsync(ct);
    }

    public async Task CleanupAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var idem = await db.IdempotencyRecords.Where(r => r.ExpiresAt < now).ExecuteDeleteAsync(ct);
        var tokenCutoff = now.AddDays(-30);
        var tokens = await db.RefreshTokens.Where(t => t.ExpiresAt < tokenCutoff || (t.RevokedAt != null && t.RevokedAt < tokenCutoff)).ExecuteDeleteAsync(ct);
        var outboxCutoff = now.AddDays(-14);
        var outboxRows = await db.OutboxMessages.Where(m => m.ProcessedAt != null && m.ProcessedAt < outboxCutoff).ExecuteDeleteAsync(ct);
        if (idem + tokens + outboxRows > 0)
            logger.LogInformation("Cleanup removed {Idempotency} idempotency records, {Tokens} refresh tokens, {Outbox} outbox rows.", idem, tokens, outboxRows);
    }

    /// <summary>Reminder per order is claimed with a conditional UPDATE on ReminderSentAt, so it is sent at most once.</summary>
    public async Task<int> SendPickupRemindersAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var horizon = now.AddHours(72);
        var candidates = await db.Orders.AsNoTracking()
            .Where(o => o.ReminderSentAt == null && o.PickupStartUtc > now && o.PickupStartUtc <= horizon
                        && (o.Status == OrderStatus.Confirmed || o.Status == OrderStatus.Preparing || o.Status == OrderStatus.ReadyForPickup))
            .Join(db.TenantSettings.Where(s => s.SendPickupReminder), o => o.TenantId, s => s.TenantId,
                (o, s) => new { o.Id, o.PickupStartUtc, s.PickupReminderHoursBefore, o.TenantId })
            .Join(db.Subscriptions.Where(s => s.Plan.EmailNotifications), x => x.TenantId, s => s.TenantId, (x, s) => x)
            .OrderBy(x => x.PickupStartUtc)
            .Take(200)
            .ToListAsync(ct);

        var sent = 0;
        foreach (var c in candidates.Where(c => c.PickupStartUtc <= now.AddHours(c.PickupReminderHoursBefore)))
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var claimed = await db.Orders.Where(o => o.Id == c.Id && o.ReminderSentAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.ReminderSentAt, now), ct);
            if (claimed == 0) continue;
            var order = await db.Orders.AsNoTracking().Include(o => o.Items).FirstAsync(o => o.Id == c.Id, ct);
            var customer = await db.CustomerContacts.AsNoTracking().FirstAsync(x => x.Id == order.CustomerContactId, ct);
            if (customer.AnonymizedAt is null)
            {
                var tenant = await db.Tenants.AsNoTracking().Include(t => t.Settings).FirstAsync(t => t.Id == order.TenantId, ct);
                var location = await db.Locations.AsNoTracking().Include(l => l.Settings).FirstAsync(l => l.Id == order.LocationId, ct);
                outbox.Enqueue(EmailTemplates.PickupReminder(customer.Email,
                    EmailTemplates.BuildModel(order, tenant, location, location.Settings, order.Items, null)));
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
            db.ChangeTracker.Clear();
            sent++;
        }
        return sent;
    }

    /// <summary>
    /// Replaces customer contact data of finished orders older than the tenant's retention period. Order lines and totals
    /// are kept for the bakery's records; only personal data is removed.
    /// </summary>
    public async Task<int> AnonymizeExpiredCustomerDataAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var policies = await db.TenantSettings.AsNoTracking().Where(s => s.CustomerDataRetentionDays > 0)
            .Select(s => new { s.TenantId, s.CustomerDataRetentionDays }).ToListAsync(ct);
        var total = 0;
        foreach (var p in policies)
        {
            var cutoff = today.AddDays(-p.CustomerDataRetentionDays);
            var contactIds = db.Orders
                .Where(o => o.TenantId == p.TenantId && o.PickupDate < cutoff &&
                            (o.Status == OrderStatus.Collected || o.Status == OrderStatus.Cancelled || o.Status == OrderStatus.NoShow))
                .Select(o => o.CustomerContactId);
            total += await db.CustomerContacts
                .Where(c => c.TenantId == p.TenantId && c.AnonymizedAt == null && contactIds.Contains(c.Id))
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.FirstName, "Anonymisiert")
                    .SetProperty(c => c.LastName, (string?)null)
                    .SetProperty(c => c.Email, "anonymisiert@invalid")
                    .SetProperty(c => c.Phone, (string?)null)
                    .SetProperty(c => c.AnonymizedAt, now), ct);
            await db.Orders.Where(o => o.TenantId == p.TenantId && o.PickupDate < cutoff && o.CustomerNote != null &&
                                       (o.Status == OrderStatus.Collected || o.Status == OrderStatus.Cancelled || o.Status == OrderStatus.NoShow))
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.CustomerNote, (string?)null), ct);
        }
        if (total > 0) logger.LogInformation("Retention job anonymised {Count} customer contacts.", total);
        return total;
    }

    /// <summary>Compares persisted stock counters with order lines. Reports only; corrections need a deliberate manual decision.</summary>
    public async Task<int> ReconcileInventoryAsync(CancellationToken ct)
    {
        var from = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddDays(-2);
        var computed = await db.OrderItems.AsNoTracking()
            .Join(db.Orders.Where(o => o.PickupDate >= from), i => i.OrderId, o => o.Id, (i, o) => new { i.DailyInventoryId, i.Quantity, o.Status })
            .GroupBy(x => x.DailyInventoryId)
            .Select(g => new
            {
                InventoryId = g.Key,
                Reserved = g.Where(x => x.Status == OrderStatus.Confirmed || x.Status == OrderStatus.Preparing || x.Status == OrderStatus.ReadyForPickup).Sum(x => x.Quantity),
                Collected = g.Where(x => x.Status == OrderStatus.Collected).Sum(x => x.Quantity),
                NoShow = g.Where(x => x.Status == OrderStatus.NoShow).Sum(x => x.Quantity),
            })
            .ToDictionaryAsync(x => x.InventoryId, ct);

        var inventories = await db.DailyInventories.AsNoTracking().Where(i => i.Date >= from)
            .Select(i => new { i.Id, i.TenantId, i.ReservedQuantity, i.CollectedQuantity, i.NoShowQuantity }).ToListAsync(ct);
        var mismatches = 0;
        foreach (var inv in inventories)
        {
            computed.TryGetValue(inv.Id, out var c);
            if ((c?.Reserved ?? 0) != inv.ReservedQuantity || (c?.Collected ?? 0) != inv.CollectedQuantity || (c?.NoShow ?? 0) != inv.NoShowQuantity)
            {
                mismatches++;
                logger.LogError("Inventory reconciliation mismatch: inventory {InventoryId} (tenant {TenantId}) counters R/C/N={R}/{C}/{N}, order lines {ER}/{EC}/{EN}.",
                    inv.Id, inv.TenantId, inv.ReservedQuantity, inv.CollectedQuantity, inv.NoShowQuantity, c?.Reserved ?? 0, c?.Collected ?? 0, c?.NoShow ?? 0);
            }
        }
        return mismatches;
    }
}

public sealed class OutboxWorker(IServiceScopeFactory scopes, IOptions<JobOptions> options, ILogger<OutboxWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(1, options.Value.OutboxIntervalSeconds));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var dispatcher = scope.ServiceProvider.GetRequiredService<OutboxDispatcher>();
                while (await dispatcher.DispatchPendingAsync(stoppingToken) > 0) { }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Outbox worker iteration failed.");
            }
            await Task.Delay(interval, stoppingToken).ContinueWith(_ => { });
        }
    }
}

public sealed class MaintenanceWorker(IServiceScopeFactory scopes, IOptions<JobOptions> options, ILogger<MaintenanceWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(30, options.Value.MaintenanceIntervalSeconds));
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken).ContinueWith(_ => { });
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<MaintenanceJobs>().RunAllAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Maintenance worker iteration failed.");
            }
            await Task.Delay(interval, stoppingToken).ContinueWith(_ => { });
        }
    }
}
