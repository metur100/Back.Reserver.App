using BackReserve.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace BackReserve.Application.Abstractions;

public interface IAppDbContext
{
    DbSet<ApplicationUser> Users { get; }
    DbSet<Tenant> Tenants { get; }
    DbSet<TenantSettings> TenantSettings { get; }
    DbSet<TenantMembership> TenantMemberships { get; }
    DbSet<LocationMembership> LocationMemberships { get; }
    DbSet<Invitation> Invitations { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<SubscriptionPlan> SubscriptionPlans { get; }
    DbSet<Subscription> Subscriptions { get; }
    DbSet<BakeryLocation> Locations { get; }
    DbSet<LocationSettings> LocationSettings { get; }
    DbSet<PickupScheduleRule> PickupScheduleRules { get; }
    DbSet<LocationClosure> LocationClosures { get; }
    DbSet<PickupSlotCounter> PickupSlotCounters { get; }
    DbSet<ProductCategory> ProductCategories { get; }
    DbSet<Product> Products { get; }
    DbSet<DailyInventory> DailyInventories { get; }
    DbSet<Order> Orders { get; }
    DbSet<OrderItem> OrderItems { get; }
    DbSet<OrderStatusHistory> OrderStatusHistory { get; }
    DbSet<CustomerContact> CustomerContacts { get; }
    DbSet<ReservationIdempotencyRecord> IdempotencyRecords { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<OutboxMessage> OutboxMessages { get; }
    DbSet<AuditLog> AuditLogs { get; }

    DatabaseFacade Database { get; }
    Microsoft.EntityFrameworkCore.ChangeTracking.ChangeTracker ChangeTracker { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

/// <summary>SQL Server specific locking primitives that cannot be expressed portably through LINQ.</summary>
public interface ISlotCounterStore
{
    /// <summary>Creates the counter row for a slot if it does not exist, safely under concurrency (UPDLOCK, HOLDLOCK).</summary>
    Task EnsureRowAsync(Guid tenantId, Guid locationId, DateOnly date, TimeOnly slotStart, CancellationToken ct);
}

public interface IDbErrorClassifier
{
    bool IsUniqueViolation(Exception ex, string? indexName = null);
    bool IsDeadlockOrTransient(Exception ex);
}

/// <summary>Who is calling the API (may be anonymous).</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
    bool IsPlatformAdmin { get; }
}

public sealed record EmailMessage(string To, string Subject, string HtmlBody, string TextBody, string Category);

/// <summary>Reliable email: messages are stored in the outbox inside the caller's transaction and delivered by a background worker.</summary>
public interface IEmailOutbox
{
    void Enqueue(EmailMessage message);
}

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public interface IAuditLogger
{
    void Log(Guid? tenantId, Guid? userId, string action, string entityType, string? entityId, object? details = null);
}

public interface IFileStorage
{
    /// <summary>Stores content under a server-generated key and returns the public URL path.</summary>
    Task<string> SaveAsync(Stream content, string extension, string contentType, CancellationToken ct);
}

/// <summary>Encrypts small payloads at rest (idempotency replays, outbox payloads).</summary>
public interface IPayloadProtector
{
    string Protect(string plaintext);
    string Unprotect(string protectedPayload);
}

public sealed class AppUrlOptions
{
    public const string Section = "App";
    /// <summary>Public base URL of the web app, used in emails (e.g. https://app.backreserve.example).</summary>
    public string WebBaseUrl { get; set; } = "http://localhost:5173";
    public string ProductName { get; set; } = "BackReserve";
}
