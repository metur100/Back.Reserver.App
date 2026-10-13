using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BackReserve.Application.Subscriptions;

public sealed class BillingOptions
{
    public const string Section = "Billing";
    /// <summary>"None" until a real billing provider is integrated. Plan changes are then a development-only operation.</summary>
    public string Provider { get; set; } = "None";
    /// <summary>Allows owners to switch plans without payment. Must be false in production while Provider is "None".</summary>
    public bool AllowDevelopmentPlanChanges { get; set; }
    public int TrialDays { get; set; } = 30;
}

public enum PlanFeature
{
    ProductionPlanning,
    CsvExport,
    CustomBranding,
    EmailNotifications,
}

/// <summary>Enforces plan limits on the backend. The frontend only mirrors these limits for display.</summary>
public sealed class SubscriptionGuard(IAppDbContext db)
{
    public async Task<SubscriptionPlan> GetPlanAsync(Guid tenantId, CancellationToken ct) =>
        await db.Subscriptions.AsNoTracking().Where(s => s.TenantId == tenantId).Select(s => s.Plan).FirstOrDefaultAsync(ct)
        ?? throw new ForbiddenException("Für diese Bäckerei ist kein Abonnement eingerichtet.", "no_subscription");

    public async Task EnsureCanAddLocationAsync(Guid tenantId, CancellationToken ct)
    {
        var plan = await GetPlanAsync(tenantId, ct);
        var count = await db.Locations.CountAsync(l => l.TenantId == tenantId, ct);
        if (count >= plan.MaxLocations)
            throw new ForbiddenException($"Ihr Tarif „{plan.Name}“ erlaubt maximal {plan.MaxLocations} Standort(e).", "plan_limit_locations");
    }

    public async Task EnsureCanAddProductAsync(Guid tenantId, CancellationToken ct)
    {
        var plan = await GetPlanAsync(tenantId, ct);
        var count = await db.Products.CountAsync(p => p.TenantId == tenantId && !p.IsArchived, ct);
        if (count >= plan.MaxProducts)
            throw new ForbiddenException($"Ihr Tarif „{plan.Name}“ erlaubt maximal {plan.MaxProducts} aktive Produkte.", "plan_limit_products");
    }

    public async Task EnsureCanAddStaffAsync(Guid tenantId, DateTimeOffset now, CancellationToken ct)
    {
        var plan = await GetPlanAsync(tenantId, ct);
        var members = await db.TenantMemberships.CountAsync(m => m.TenantId == tenantId && m.IsActive, ct);
        var pending = await db.Invitations.CountAsync(i => i.TenantId == tenantId && i.AcceptedAt == null && i.RevokedAt == null && i.ExpiresAt > now, ct);
        if (members + pending >= plan.MaxStaff)
            throw new ForbiddenException($"Ihr Tarif „{plan.Name}“ erlaubt maximal {plan.MaxStaff} Benutzerkonten.", "plan_limit_staff");
    }

    public async Task EnsureFeatureAsync(Guid tenantId, PlanFeature feature, CancellationToken ct)
    {
        var plan = await GetPlanAsync(tenantId, ct);
        var enabled = feature switch
        {
            PlanFeature.ProductionPlanning => plan.ProductionPlanning,
            PlanFeature.CsvExport => plan.CsvExport,
            PlanFeature.CustomBranding => plan.CustomBranding,
            PlanFeature.EmailNotifications => plan.EmailNotifications,
            _ => false,
        };
        if (!enabled)
            throw new ForbiddenException($"Diese Funktion ist in Ihrem Tarif „{plan.Name}“ nicht enthalten.", "plan_feature_unavailable");
    }
}

public sealed class SubscriptionService(
    IAppDbContext db, IAdminContextAccessor admin, IAuditLogger audit, IOptions<BillingOptions> billing, TimeProvider clock)
{
    public static SubscriptionPlanDto ToDto(SubscriptionPlan p) => new(
        p.Id, p.Code, p.Name, p.MonthlyPrice, p.Currency, p.MaxLocations, p.MaxProducts, p.MaxStaff,
        p.ProductionPlanning, p.CsvExport, p.CustomBranding, p.EmailNotifications);

    public async Task<IReadOnlyList<SubscriptionPlanDto>> GetPlansAsync(CancellationToken ct) =>
        (await db.SubscriptionPlans.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.SortOrder).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<SubscriptionDto> GetCurrentAsync(CancellationToken ct)
    {
        var ctx = admin.Context;
        var sub = await db.Subscriptions.AsNoTracking().Include(s => s.Plan).FirstOrDefaultAsync(s => s.TenantId == ctx.TenantId, ct)
            ?? throw new NotFoundException("Kein Abonnement gefunden.");
        var locations = await db.Locations.CountAsync(l => l.TenantId == ctx.TenantId, ct);
        var products = await db.Products.CountAsync(p => p.TenantId == ctx.TenantId && !p.IsArchived, ct);
        var staff = await db.TenantMemberships.CountAsync(m => m.TenantId == ctx.TenantId && m.IsActive, ct);
        return new SubscriptionDto(ToDto(sub.Plan), sub.Status, sub.TrialEndsAt, sub.CurrentPeriodEndsAt, sub.BillingProvider,
            billing.Value.Provider != "None", locations, products, staff);
    }

    /// <summary>Development-only plan switch. Refuses to run when a real billing provider would be required.</summary>
    public async Task<SubscriptionDto> ChangePlanAsync(ChangePlanRequest request, CancellationToken ct)
    {
        var ctx = admin.Context;
        ctx.Require(Permission.SubscriptionManage);
        if (!billing.Value.AllowDevelopmentPlanChanges)
            throw new ForbiddenException("Tarifwechsel sind erst nach Anbindung eines Zahlungsanbieters möglich. Bitte kontaktieren Sie den Support.", "billing_not_configured");

        var plan = await db.SubscriptionPlans.FirstOrDefaultAsync(p => p.Code == request.PlanCode && p.IsActive, ct)
            ?? throw new NotFoundException("Tarif nicht gefunden.");
        var locations = await db.Locations.CountAsync(l => l.TenantId == ctx.TenantId, ct);
        if (locations > plan.MaxLocations)
            throw new ConflictException("plan_downgrade_blocked", $"Der Tarif erlaubt nur {plan.MaxLocations} Standort(e). Bitte deaktivieren bzw. entfernen Sie zuerst Standorte.");

        var sub = await db.Subscriptions.FirstAsync(s => s.TenantId == ctx.TenantId, ct);
        sub.PlanId = plan.Id;
        sub.UpdatedAt = clock.GetUtcNow();
        audit.Log(ctx.TenantId, ctx.UserId, "subscription.plan_changed_dev", nameof(Subscription), sub.Id.ToString(), new { plan = plan.Code });
        await db.SaveChangesAsync(ct);
        return await GetCurrentAsync(ct);
    }
}
