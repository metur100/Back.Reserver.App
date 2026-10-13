using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Platform;

/// <summary>
/// Platform administration. Deliberately exposes only tenant-level metadata — never orders or customer data.
/// </summary>
public sealed class PlatformService(IAppDbContext db, ICurrentUser currentUser, IAuditLogger audit, TimeProvider clock)
{
    private void RequireAdmin()
    {
        if (!currentUser.IsPlatformAdmin) throw new ForbiddenException();
    }

    public async Task<PagedResult<PlatformTenantDto>> ListTenantsAsync(string? search, int page, int pageSize, CancellationToken ct)
    {
        RequireAdmin();
        var q = db.Tenants.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search)) q = q.Where(t => t.Name.Contains(search) || t.Slug.Contains(search));
        var p = new PageQuery(page, pageSize);
        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(t => t.Name).Skip(p.Skip).Take(p.SafePageSize)
            .Select(t => new PlatformTenantDto(t.Id, t.Name, t.Slug, t.Status, t.IsPublished,
                t.Subscription != null ? t.Subscription.Plan.Code : null,
                t.Subscription != null ? t.Subscription.Status : null,
                t.Locations.Count, t.CreatedAt))
            .ToListAsync(ct);
        return new PagedResult<PlatformTenantDto>(items, p.SafePage, p.SafePageSize, total);
    }

    public async Task SetTenantStatusAsync(Guid tenantId, TenantStatus status, string? reason, CancellationToken ct)
    {
        RequireAdmin();
        var tenant = await db.Tenants.Include(t => t.Subscription).FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new NotFoundException("Mandant nicht gefunden.");
        tenant.Status = status;
        tenant.UpdatedAt = clock.GetUtcNow();
        audit.Log(tenantId, currentUser.UserId, status == TenantStatus.Suspended ? "platform.tenant_suspended" : "platform.tenant_reactivated",
            nameof(Tenant), tenantId.ToString(), new { reason });
        await db.SaveChangesAsync(ct);
    }

    public async Task<PlatformHealthDto> GetHealthAsync(CancellationToken ct)
    {
        RequireAdmin();
        var tenants = await db.Tenants.CountAsync(ct);
        var active = await db.Tenants.CountAsync(t => t.Status == TenantStatus.Active, ct);
        var pending = await db.OutboxMessages.CountAsync(m => m.ProcessedAt == null && !m.Failed, ct);
        var failed = await db.OutboxMessages.CountAsync(m => m.Failed, ct);
        var oldest = await db.OutboxMessages.Where(m => m.ProcessedAt == null && !m.Failed).OrderBy(m => m.CreatedAt)
            .Select(m => (DateTimeOffset?)m.CreatedAt).FirstOrDefaultAsync(ct);
        return new PlatformHealthDto(tenants, active, pending, failed, oldest);
    }
}
