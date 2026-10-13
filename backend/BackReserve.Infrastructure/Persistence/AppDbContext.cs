using BackReserve.Application.Abstractions;
using BackReserve.Domain.Entities;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options), IAppDbContext, IDataProtectionKeyContext
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantSettings> TenantSettings => Set<TenantSettings>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<LocationMembership> LocationMemberships => Set<LocationMembership>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<BakeryLocation> Locations => Set<BakeryLocation>();
    public DbSet<LocationSettings> LocationSettings => Set<LocationSettings>();
    public DbSet<PickupScheduleRule> PickupScheduleRules => Set<PickupScheduleRule>();
    public DbSet<LocationClosure> LocationClosures => Set<LocationClosure>();
    public DbSet<PickupSlotCounter> PickupSlotCounters => Set<PickupSlotCounter>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<DailyInventory> DailyInventories => Set<DailyInventory>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderStatusHistory> OrderStatusHistory => Set<OrderStatusHistory>();
    public DbSet<CustomerContact> CustomerContacts => Set<CustomerContact>();
    public DbSet<ReservationIdempotencyRecord> IdempotencyRecords => Set<ReservationIdempotencyRecord>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    Task<int> IAppDbContext.SaveChangesAsync(CancellationToken ct) => SaveChangesAsync(ct);

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // Money is always decimal(10,2); never floating point.
        builder.Properties<decimal>().HavePrecision(10, 2);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        // SQL Server forbids multiple cascade paths; BackReserve never hard-deletes business data anyway.
        foreach (var fk in b.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys())
                     .Where(fk => !fk.IsOwnership && fk.DeleteBehavior == DeleteBehavior.Cascade
                                  && !fk.DeclaringEntityType.ClrType.Namespace!.StartsWith("Microsoft.AspNetCore.Identity")))
        {
            fk.DeleteBehavior = DeleteBehavior.Restrict;
        }
    }
}
