using BackReserve.Application.Abstractions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Infrastructure.Persistence;

public sealed class SqlServerSlotCounterStore(AppDbContext db) : ISlotCounterStore
{
    /// <summary>
    /// Insert-if-missing under a serializable key-range lock (UPDLOCK, HOLDLOCK) on the unique slot index.
    /// Two concurrent first reservations for a slot serialise here instead of racing into a duplicate-key error.
    /// Must run inside the caller's transaction so the lock is held until the capacity UPDATE has happened.
    /// </summary>
    public async Task EnsureRowAsync(Guid tenantId, Guid locationId, DateOnly date, TimeOnly slotStart, CancellationToken ct)
    {
        var id = Guid.CreateVersion7();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO [PickupSlotCounters] ([Id], [TenantId], [LocationId], [Date], [SlotStart], [OrderCount], [ItemCount])
            SELECT {id}, {tenantId}, {locationId}, {date}, {slotStart}, 0, 0
            WHERE NOT EXISTS (
                SELECT 1 FROM [PickupSlotCounters] WITH (UPDLOCK, HOLDLOCK)
                WHERE [LocationId] = {locationId} AND [Date] = {date} AND [SlotStart] = {slotStart});
            """, ct);
    }
}

public sealed class SqlServerErrorClassifier : IDbErrorClassifier
{
    private static SqlException? FindSqlException(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
            if (e is SqlException sql) return sql;
        return null;
    }

    public bool IsUniqueViolation(Exception ex, string? indexName = null)
    {
        var sql = FindSqlException(ex);
        if (sql is null || (sql.Number != 2601 && sql.Number != 2627)) return false;
        return indexName is null || sql.Message.Contains(indexName, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>1205 = deadlock victim, 1222 = lock timeout, -2 = client timeout.</summary>
    public bool IsDeadlockOrTransient(Exception ex) => FindSqlException(ex)?.Number is 1205 or 1222;
}
