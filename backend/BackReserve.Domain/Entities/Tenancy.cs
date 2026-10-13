using BackReserve.Domain.Common;
using BackReserve.Domain.Enums;
using Microsoft.AspNetCore.Identity;

namespace BackReserve.Domain.Entities;

public class ApplicationUser : IdentityUser<Guid>
{
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<TenantMembership> Memberships { get; set; } = [];
}

public class Tenant : Entity, IAuditableTimestamps
{
    public string Name { get; set; } = "";
    /// <summary>URL slug for the public page, e.g. /b/baeckerei-rheinblick. Globally unique.</summary>
    public string Slug { get; set; } = "";
    public string? Description { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? BrandColor { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public string? Website { get; set; }
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    /// <summary>Only published tenants are visible on public endpoints.</summary>
    public bool IsPublished { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public TenantSettings Settings { get; set; } = null!;
    public Subscription? Subscription { get; set; }
    public ICollection<BakeryLocation> Locations { get; set; } = [];
    public ICollection<TenantMembership> Memberships { get; set; } = [];
}

public class TenantSettings : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public bool RequireCustomerLastName { get; set; } = true;
    public bool RequireCustomerPhone { get; set; }
    public bool SendReadyNotification { get; set; } = true;
    public bool SendPickupReminder { get; set; }
    public int PickupReminderHoursBefore { get; set; } = 12;
    public string? PickupInstructions { get; set; }
    public string? CancellationPolicyText { get; set; }
    public string? AllergenDisclaimer { get; set; }
    /// <summary>Customer contact data of finished orders is anonymised after this many days (0 = disabled).</summary>
    public int CustomerDataRetentionDays { get; set; } = 365;
    public string Currency { get; set; } = "EUR";
}

public class TenantMembership : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public MembershipRole Role { get; set; }
    /// <summary>Custom permission set for managers/staff. Null = role default. Always capped by the role ceiling.</summary>
    public Permission? CustomPermissions { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }

    public Tenant Tenant { get; set; } = null!;
    public ApplicationUser User { get; set; } = null!;
    public ICollection<LocationMembership> Locations { get; set; } = [];
}

/// <summary>Grants a manager or staff member access to a single location. Owners implicitly access all locations.</summary>
public class LocationMembership : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid TenantMembershipId { get; set; }
    public Guid LocationId { get; set; }

    public TenantMembership Membership { get; set; } = null!;
    public BakeryLocation Location { get; set; } = null!;
}

public class Invitation : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public string Email { get; set; } = "";
    public MembershipRole Role { get; set; }
    public Permission? CustomPermissions { get; set; }
    /// <summary>Comma separated location ids the invitee will be assigned to.</summary>
    public string LocationIds { get; set; } = "";
    /// <summary>SHA-256 of the single-use token; the raw token is only ever sent by email.</summary>
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid InvitedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Tenant Tenant { get; set; } = null!;

    public IReadOnlyList<Guid> GetLocationIds() =>
        LocationIds.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(Guid.Parse).ToList();
}

public class RefreshToken : Entity
{
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
}

public class SubscriptionPlan : Entity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal MonthlyPrice { get; set; }
    public string Currency { get; set; } = "EUR";
    public int MaxLocations { get; set; }
    public int MaxProducts { get; set; }
    public int MaxStaff { get; set; }
    public bool ProductionPlanning { get; set; }
    public bool CsvExport { get; set; }
    public bool CustomBranding { get; set; }
    public bool EmailNotifications { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

public class Subscription : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid PlanId { get; set; }
    public SubscriptionStatus Status { get; set; }
    public DateTimeOffset? TrialEndsAt { get; set; }
    public DateTimeOffset? CurrentPeriodEndsAt { get; set; }
    /// <summary>"None" while no billing provider is integrated. Never claims a payment happened.</summary>
    public string BillingProvider { get; set; } = "None";
    public string? ExternalReference { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public SubscriptionPlan Plan { get; set; } = null!;
}

public class AuditLog : Entity
{
    public Guid? TenantId { get; set; }
    public Guid? UserId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string? EntityId { get; set; }
    /// <summary>Small JSON payload. Must never contain customer personal data.</summary>
    public string? Details { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Notification : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid? LocationId { get; set; }
    public NotificationType Type { get; set; }
    public Guid? OrderId { get; set; }
    public string Message { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}

public class OutboxMessage : Entity
{
    public string Type { get; set; } = "";
    /// <summary>Payload, encrypted with ASP.NET Data Protection because it can contain capability links.</summary>
    public string Payload { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public bool Failed { get; set; }
}
