using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Notifications;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BackReserve.Application.Staff;

public sealed class StaffService(
    IAppDbContext db, IAdminContextAccessor admin, SubscriptionGuard guard, IEmailOutbox outbox, IAuditLogger audit,
    IOptions<AppUrlOptions> urls, TimeProvider clock)
{
    public static readonly TimeSpan InvitationLifetime = TimeSpan.FromDays(7);
    private AdminContext Ctx => admin.Context;

    public static IReadOnlyList<string> PermissionNames(Permission p) =>
        Enum.GetValues<Permission>().Where(v => v != Permission.None && (p & v) == v).Select(v => v.ToString()).ToList();

    public async Task<StaffOverviewDto> GetAsync(CancellationToken ct)
    {
        Ctx.Require(Permission.StaffManage);
        var members = await db.TenantMemberships.AsNoTracking()
            .Where(m => m.TenantId == Ctx.TenantId)
            .Include(m => m.User).Include(m => m.Locations)
            .OrderBy(m => m.Role).ThenBy(m => m.User.FirstName)
            .ToListAsync(ct);
        var now = clock.GetUtcNow();
        var invitations = await db.Invitations.AsNoTracking()
            .Where(i => i.TenantId == Ctx.TenantId && i.AcceptedAt == null && i.RevokedAt == null)
            .OrderByDescending(i => i.CreatedAt).ToListAsync(ct);
        var plan = await guard.GetPlanAsync(Ctx.TenantId, ct);

        return new StaffOverviewDto(
            members.Select(m => new StaffMemberDto(
                m.Id, m.UserId, m.User.FirstName, m.User.LastName, m.User.Email ?? "", m.Role,
                PermissionNames(RolePermissions.Effective(m.Role, m.CustomPermissions)),
                m.Role == MembershipRole.Owner ? null : m.Locations.Select(l => l.LocationId).ToList(),
                m.IsActive, m.UserId == Ctx.UserId)).ToList(),
            invitations.Select(i => new InvitationDto(i.Id, i.Email, i.Role, i.GetLocationIds(), i.ExpiresAt,
                i.ExpiresAt <= now ? "expired" : "pending", i.CreatedAt)).ToList(),
            plan.MaxStaff);
    }

    public async Task<InvitationDto> InviteAsync(InviteStaffRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.StaffManage);
        if (request.Role == MembershipRole.Owner)
            throw new BusinessRuleException("invalid_role", "Inhaber-Rechte können nicht per Einladung vergeben werden.");
        var now = clock.GetUtcNow();
        await guard.EnsureCanAddStaffAsync(Ctx.TenantId, now, ct);
        await EnsureLocationsAsync(request.LocationIds, ct);

        var email = request.Email.Trim();
        var normalized = email.ToUpperInvariant();
        var alreadyMember = await db.TenantMemberships.AnyAsync(m => m.TenantId == Ctx.TenantId && m.User.NormalizedEmail == normalized, ct);
        if (alreadyMember)
            throw new ConflictException("already_member", "Diese Person gehört bereits zu Ihrem Team.");

        // Older open invitations for the same address are revoked so only one link is valid.
        var open = await db.Invitations.Where(i => i.TenantId == Ctx.TenantId && i.Email == email && i.AcceptedAt == null && i.RevokedAt == null).ToListAsync(ct);
        foreach (var o in open) o.RevokedAt = now;

        var token = Codes.NewSecureToken();
        var invitation = new Invitation
        {
            TenantId = Ctx.TenantId,
            Email = email,
            Role = request.Role,
            CustomPermissions = request.Permissions is { Count: > 0 } perms
                ? perms.Aggregate(Permission.None, (a, p) => a | p) & RolePermissions.Ceiling(request.Role)
                : null,
            LocationIds = string.Join(',', request.LocationIds.Distinct()),
            TokenHash = Codes.Sha256(token),
            ExpiresAt = now + InvitationLifetime,
            InvitedByUserId = Ctx.UserId,
            CreatedAt = now,
        };
        db.Invitations.Add(invitation);

        var tenantName = await db.Tenants.Where(t => t.Id == Ctx.TenantId).Select(t => t.Name).FirstAsync(ct);
        var link = $"{urls.Value.WebBaseUrl.TrimEnd('/')}/einladung#t={token}";
        outbox.Enqueue(EmailTemplates.StaffInvitation(email, tenantName, EmailTemplates.RoleName(request.Role), link, invitation.ExpiresAt));
        audit.Log(Ctx.TenantId, Ctx.UserId, "staff.invited", nameof(Invitation), invitation.Id.ToString(), new { role = request.Role.ToString() });
        await db.SaveChangesAsync(ct);
        // The token is deliberately not part of the response; it is delivered by email only.
        return new InvitationDto(invitation.Id, invitation.Email, invitation.Role, invitation.GetLocationIds(), invitation.ExpiresAt, "pending", now);
    }

    public async Task RevokeInvitationAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.StaffManage);
        var invitation = await db.Invitations.FirstOrDefaultAsync(i => i.Id == id && i.TenantId == Ctx.TenantId, ct)
            ?? throw new NotFoundException("Einladung nicht gefunden.");
        if (invitation.AcceptedAt is not null) throw new ConflictException("invitation_accepted", "Die Einladung wurde bereits angenommen.");
        invitation.RevokedAt ??= clock.GetUtcNow();
        audit.Log(Ctx.TenantId, Ctx.UserId, "staff.invitation_revoked", nameof(Invitation), id.ToString());
        await db.SaveChangesAsync(ct);
    }

    public async Task<StaffOverviewDto> UpdateMembershipAsync(Guid membershipId, UpdateMembershipRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.StaffManage);
        var membership = await db.TenantMemberships.Include(m => m.Locations)
            .FirstOrDefaultAsync(m => m.Id == membershipId && m.TenantId == Ctx.TenantId, ct)
            ?? throw new NotFoundException("Teammitglied nicht gefunden.");
        if (membership.UserId == Ctx.UserId)
            throw new BusinessRuleException("cannot_modify_self", "Sie können Ihre eigene Rolle nicht ändern.");
        if (membership.Role == MembershipRole.Owner || request.Role == MembershipRole.Owner)
            throw new BusinessRuleException("owner_immutable", "Inhaber-Rechte können hier nicht geändert werden.");
        await EnsureLocationsAsync(request.LocationIds, ct);
        if (request.IsActive && !membership.IsActive)
            await guard.EnsureCanAddStaffAsync(Ctx.TenantId, clock.GetUtcNow(), ct);

        membership.Role = request.Role;
        membership.IsActive = request.IsActive;
        membership.CustomPermissions = request.Permissions is { Count: > 0 } perms
            ? perms.Aggregate(Permission.None, (a, p) => a | p) & RolePermissions.Ceiling(request.Role)
            : null;
        db.LocationMemberships.RemoveRange(membership.Locations);
        foreach (var locationId in request.LocationIds.Distinct())
            db.LocationMemberships.Add(new LocationMembership { TenantId = Ctx.TenantId, TenantMembershipId = membership.Id, LocationId = locationId });

        audit.Log(Ctx.TenantId, Ctx.UserId, "staff.membership_updated", nameof(TenantMembership), membershipId.ToString(),
            new { role = request.Role.ToString(), request.IsActive, locations = request.LocationIds.Count });
        await db.SaveChangesAsync(ct);
        return await GetAsync(ct);
    }

    private async Task EnsureLocationsAsync(IReadOnlyList<Guid> locationIds, CancellationToken ct)
    {
        if (locationIds.Count == 0)
            throw new BusinessRuleException("locations_required", "Bitte mindestens einen Standort zuweisen.");
        var distinct = locationIds.Distinct().ToList();
        var count = await db.Locations.CountAsync(l => l.TenantId == Ctx.TenantId && distinct.Contains(l.Id), ct);
        if (count != distinct.Count) throw new BusinessRuleException("invalid_location", "Mindestens ein Standort ist ungültig.");
    }
}
