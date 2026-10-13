using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Settings;

public sealed class SettingsService(IAppDbContext db, IAdminContextAccessor admin, SubscriptionGuard guard, IAuditLogger audit, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    public async Task<TenantSettingsDto> GetAsync(CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var t = await db.Tenants.AsNoTracking().Include(x => x.Settings).FirstAsync(x => x.Id == Ctx.TenantId, ct);
        return ToDto(t);
    }

    public async Task<TenantSettingsDto> UpdateAsync(UpdateTenantSettingsRequest r, CancellationToken ct)
    {
        Ctx.Require(Permission.SettingsManage);
        var t = await db.Tenants.Include(x => x.Settings).FirstAsync(x => x.Id == Ctx.TenantId, ct);

        var brandingChanged = Clean(r.BrandColor) != t.BrandColor || Clean(r.CoverImageUrl) != t.CoverImageUrl;
        if (brandingChanged) await guard.EnsureFeatureAsync(Ctx.TenantId, PlanFeature.CustomBranding, ct);
        if (r.SendPickupReminder && !t.Settings.SendPickupReminder)
            await guard.EnsureFeatureAsync(Ctx.TenantId, PlanFeature.EmailNotifications, ct);

        if (r.IsPublished && !t.IsPublished)
        {
            var hasActiveLocation = await db.Locations.AnyAsync(l => l.TenantId == t.Id && l.IsActive, ct);
            if (!hasActiveLocation)
                throw new BusinessRuleException("no_active_location", "Bitte legen Sie zuerst mindestens einen aktiven Standort an.");
        }

        t.Name = r.Name.Trim();
        t.Description = Clean(r.Description);
        t.LogoUrl = Clean(r.LogoUrl);
        t.CoverImageUrl = Clean(r.CoverImageUrl);
        t.BrandColor = Clean(r.BrandColor);
        t.ContactEmail = Clean(r.ContactEmail);
        t.ContactPhone = Clean(r.ContactPhone);
        t.Website = Clean(r.Website);
        t.IsPublished = r.IsPublished;
        t.UpdatedAt = clock.GetUtcNow();
        var s = t.Settings;
        s.RequireCustomerLastName = r.RequireCustomerLastName;
        s.RequireCustomerPhone = r.RequireCustomerPhone;
        s.SendReadyNotification = r.SendReadyNotification;
        s.SendPickupReminder = r.SendPickupReminder;
        s.PickupReminderHoursBefore = r.PickupReminderHoursBefore;
        s.PickupInstructions = Clean(r.PickupInstructions);
        s.CancellationPolicyText = Clean(r.CancellationPolicyText);
        s.AllergenDisclaimer = Clean(r.AllergenDisclaimer);
        s.CustomerDataRetentionDays = r.CustomerDataRetentionDays;

        audit.Log(Ctx.TenantId, Ctx.UserId, "tenant.settings_updated", nameof(Tenant), t.Id.ToString(), new { t.IsPublished });
        await db.SaveChangesAsync(ct);
        return ToDto(t);
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static TenantSettingsDto ToDto(Tenant t) => new(
        t.Id, t.Name, t.Slug, t.Description, t.LogoUrl, t.CoverImageUrl, t.BrandColor, t.ContactEmail, t.ContactPhone, t.Website,
        t.IsPublished, t.Settings.RequireCustomerLastName, t.Settings.RequireCustomerPhone, t.Settings.SendReadyNotification,
        t.Settings.SendPickupReminder, t.Settings.PickupReminderHoursBefore, t.Settings.PickupInstructions,
        t.Settings.CancellationPolicyText, t.Settings.AllergenDisclaimer, t.Settings.CustomerDataRetentionDays);
}

public sealed class NotificationService(IAppDbContext db, IAdminContextAccessor admin, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    private IQueryable<Notification> Scoped()
    {
        var q = db.Notifications.Where(n => n.TenantId == Ctx.TenantId);
        if (Ctx.LocationIds is { } allowed) q = q.Where(n => n.LocationId == null || allowed.Contains(n.LocationId.Value));
        return q;
    }

    public async Task<IReadOnlyList<NotificationDto>> ListAsync(bool unreadOnly, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var q = Scoped().AsNoTracking();
        if (unreadOnly) q = q.Where(n => n.ReadAt == null);
        return await q.OrderByDescending(n => n.CreatedAt).Take(50)
            .Select(n => new NotificationDto(n.Id, n.Type, n.OrderId, n.Message, n.CreatedAt, n.ReadAt != null))
            .ToListAsync(ct);
    }

    public async Task MarkAllReadAsync(CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var now = clock.GetUtcNow();
        await Scoped().Where(n => n.ReadAt == null).ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), ct);
    }
}
