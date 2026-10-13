using BackReserve.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BackReserve.Infrastructure.Persistence;

internal sealed class ApplicationUserConfig : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> e)
    {
        e.Property(x => x.FirstName).HasMaxLength(80);
        e.Property(x => x.LastName).HasMaxLength(80);
    }
}

internal sealed class TenantConfig : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> e)
    {
        e.Property(x => x.Name).HasMaxLength(120).IsRequired();
        e.Property(x => x.Slug).HasMaxLength(60).IsRequired();
        e.HasIndex(x => x.Slug).IsUnique();
        e.Property(x => x.Description).HasMaxLength(1000);
        e.Property(x => x.LogoUrl).HasMaxLength(500);
        e.Property(x => x.CoverImageUrl).HasMaxLength(500);
        e.Property(x => x.BrandColor).HasMaxLength(7);
        e.Property(x => x.ContactEmail).HasMaxLength(254);
        e.Property(x => x.ContactPhone).HasMaxLength(30);
        e.Property(x => x.Website).HasMaxLength(500);
        e.HasOne(x => x.Settings).WithOne().HasForeignKey<TenantSettings>(s => s.TenantId);
        e.HasOne(x => x.Subscription).WithOne().HasForeignKey<Subscription>(s => s.TenantId);
        e.HasMany(x => x.Locations).WithOne(l => l.Tenant).HasForeignKey(l => l.TenantId);
        e.HasMany(x => x.Memberships).WithOne(m => m.Tenant).HasForeignKey(m => m.TenantId);
    }
}

internal sealed class TenantSettingsConfig : IEntityTypeConfiguration<TenantSettings>
{
    public void Configure(EntityTypeBuilder<TenantSettings> e)
    {
        e.HasIndex(x => x.TenantId).IsUnique();
        e.Property(x => x.PickupInstructions).HasMaxLength(1000);
        e.Property(x => x.CancellationPolicyText).HasMaxLength(1000);
        e.Property(x => x.AllergenDisclaimer).HasMaxLength(1000);
        e.Property(x => x.Currency).HasMaxLength(3);
    }
}

internal sealed class TenantMembershipConfig : IEntityTypeConfiguration<TenantMembership>
{
    public void Configure(EntityTypeBuilder<TenantMembership> e)
    {
        e.HasIndex(x => new { x.TenantId, x.UserId }).IsUnique();
        e.HasIndex(x => x.UserId);
        e.HasOne(x => x.User).WithMany(u => u.Memberships).HasForeignKey(x => x.UserId);
        e.HasMany(x => x.Locations).WithOne(l => l.Membership).HasForeignKey(l => l.TenantMembershipId);
    }
}

internal sealed class LocationMembershipConfig : IEntityTypeConfiguration<LocationMembership>
{
    public void Configure(EntityTypeBuilder<LocationMembership> e)
    {
        e.HasIndex(x => new { x.TenantMembershipId, x.LocationId }).IsUnique();
        // Composite FK: a location grant can only point to a location of the same tenant.
        e.HasOne(x => x.Location).WithMany()
            .HasForeignKey(x => new { x.TenantId, x.LocationId })
            .HasPrincipalKey(l => new { l.TenantId, l.Id });
    }
}

internal sealed class InvitationConfig : IEntityTypeConfiguration<Invitation>
{
    public void Configure(EntityTypeBuilder<Invitation> e)
    {
        e.Property(x => x.Email).HasMaxLength(254).IsRequired();
        e.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        e.Property(x => x.LocationIds).HasMaxLength(2000);
        e.HasIndex(x => x.TokenHash).IsUnique();
        e.HasIndex(x => new { x.TenantId, x.Email });
        e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
    }
}

internal sealed class RefreshTokenConfig : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> e)
    {
        e.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        e.HasIndex(x => x.TokenHash).IsUnique();
        e.HasIndex(x => x.UserId);
        e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class SubscriptionPlanConfig : IEntityTypeConfiguration<SubscriptionPlan>
{
    public void Configure(EntityTypeBuilder<SubscriptionPlan> e)
    {
        e.Property(x => x.Code).HasMaxLength(40).IsRequired();
        e.Property(x => x.Name).HasMaxLength(80).IsRequired();
        e.Property(x => x.Currency).HasMaxLength(3);
        e.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class SubscriptionConfig : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> e)
    {
        e.HasIndex(x => x.TenantId).IsUnique();
        e.Property(x => x.BillingProvider).HasMaxLength(40);
        e.Property(x => x.ExternalReference).HasMaxLength(200);
        e.HasOne(x => x.Plan).WithMany().HasForeignKey(x => x.PlanId);
    }
}

internal sealed class AuditLogConfig : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> e)
    {
        e.Property(x => x.Action).HasMaxLength(80).IsRequired();
        e.Property(x => x.EntityType).HasMaxLength(80).IsRequired();
        e.Property(x => x.EntityId).HasMaxLength(80);
        e.Property(x => x.Details).HasMaxLength(4000);
        e.HasIndex(x => new { x.TenantId, x.CreatedAt });
    }
}

internal sealed class NotificationConfig : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> e)
    {
        e.Property(x => x.Message).HasMaxLength(500);
        e.HasIndex(x => new { x.TenantId, x.ReadAt, x.CreatedAt });
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId);
    }
}

internal sealed class OutboxMessageConfig : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> e)
    {
        e.Property(x => x.Type).HasMaxLength(80).IsRequired();
        e.Property(x => x.LastError).HasMaxLength(2000);
        e.HasIndex(x => new { x.ProcessedAt, x.Failed, x.NextAttemptAt });
    }
}

internal sealed class LocationConfig : IEntityTypeConfiguration<BakeryLocation>
{
    public void Configure(EntityTypeBuilder<BakeryLocation> e)
    {
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.Property(x => x.Name).HasMaxLength(120).IsRequired();
        e.Property(x => x.Street).HasMaxLength(200);
        e.Property(x => x.PostalCode).HasMaxLength(10);
        e.Property(x => x.City).HasMaxLength(100);
        e.Property(x => x.Country).HasMaxLength(2);
        e.Property(x => x.Phone).HasMaxLength(30);
        e.Property(x => x.Email).HasMaxLength(254);
        e.HasOne(x => x.Settings).WithOne().HasForeignKey<LocationSettings>(s => s.LocationId);
        e.HasMany(x => x.ScheduleRules).WithOne().HasForeignKey(r => r.LocationId);
        e.HasMany(x => x.Closures).WithOne().HasForeignKey(c => c.LocationId);
    }
}

internal sealed class LocationSettingsConfig : IEntityTypeConfiguration<LocationSettings>
{
    public void Configure(EntityTypeBuilder<LocationSettings> e)
    {
        e.HasIndex(x => x.LocationId).IsUnique();
        e.Property(x => x.TimeZoneId).HasMaxLength(64).IsRequired();
    }
}

internal sealed class PickupScheduleRuleConfig : IEntityTypeConfiguration<PickupScheduleRule>
{
    public void Configure(EntityTypeBuilder<PickupScheduleRule> e)
    {
        e.HasIndex(x => new { x.LocationId, x.DayOfWeek }).IsUnique();
        e.ToTable(t =>
        {
            t.HasCheckConstraint("CK_PickupScheduleRules_Capacity", "[MaxOrdersPerSlot] > 0 AND [SlotMinutes] > 0");
        });
    }
}

internal sealed class LocationClosureConfig : IEntityTypeConfiguration<LocationClosure>
{
    public void Configure(EntityTypeBuilder<LocationClosure> e)
    {
        e.HasIndex(x => new { x.LocationId, x.Date }).IsUnique();
        e.Property(x => x.Reason).HasMaxLength(200);
    }
}

internal sealed class PickupSlotCounterConfig : IEntityTypeConfiguration<PickupSlotCounter>
{
    public void Configure(EntityTypeBuilder<PickupSlotCounter> e)
    {
        e.HasIndex(x => new { x.LocationId, x.Date, x.SlotStart }).IsUnique().HasDatabaseName("IX_PickupSlotCounters_Slot");
        e.HasOne<BakeryLocation>().WithMany()
            .HasForeignKey(x => new { x.TenantId, x.LocationId })
            .HasPrincipalKey(l => new { l.TenantId, l.Id });
        e.ToTable(t => t.HasCheckConstraint("CK_PickupSlotCounters_NonNegative", "[OrderCount] >= 0 AND [ItemCount] >= 0"));
    }
}

internal sealed class ProductCategoryConfig : IEntityTypeConfiguration<ProductCategory>
{
    public void Configure(EntityTypeBuilder<ProductCategory> e)
    {
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.Property(x => x.Name).HasMaxLength(80).IsRequired();
        e.Property(x => x.Slug).HasMaxLength(100).IsRequired();
        e.HasIndex(x => new { x.TenantId, x.Slug }).IsUnique();
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId);
    }
}

internal sealed class ProductConfig : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> e)
    {
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.Property(x => x.Name).HasMaxLength(120).IsRequired();
        e.Property(x => x.Slug).HasMaxLength(140).IsRequired();
        e.Property(x => x.Description).HasMaxLength(1000);
        e.Property(x => x.Currency).HasMaxLength(3);
        e.Property(x => x.ImageUrl).HasMaxLength(500);
        e.Property(x => x.Allergens).HasMaxLength(1000);
        e.Property(x => x.Ingredients).HasMaxLength(2000);
        e.Property(x => x.DietaryLabels).HasMaxLength(500);
        e.Property(x => x.RowVersion).IsRowVersion();
        e.HasIndex(x => new { x.TenantId, x.Slug }).IsUnique();
        e.HasIndex(x => new { x.TenantId, x.IsPublished, x.IsArchived });
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId);
        // Category must belong to the same tenant.
        e.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => new { x.TenantId, x.CategoryId })
            .HasPrincipalKey(c => new { c.TenantId, c.Id })
            .IsRequired(false);
        e.ToTable(t => t.HasCheckConstraint("CK_Products_Price", "[BasePrice] >= 0 AND [LeadTimeHours] >= 0"));
    }
}

internal sealed class DailyInventoryConfig : IEntityTypeConfiguration<DailyInventory>
{
    public void Configure(EntityTypeBuilder<DailyInventory> e)
    {
        e.HasIndex(x => new { x.LocationId, x.ProductId, x.Date }).IsUnique().HasDatabaseName("IX_DailyInventories_Location_Product_Date");
        e.HasIndex(x => new { x.TenantId, x.LocationId, x.Date });
        e.HasOne(x => x.Location).WithMany()
            .HasForeignKey(x => new { x.TenantId, x.LocationId })
            .HasPrincipalKey(l => new { l.TenantId, l.Id });
        e.HasOne(x => x.Product).WithMany()
            .HasForeignKey(x => new { x.TenantId, x.ProductId })
            .HasPrincipalKey(p => new { p.TenantId, p.Id });
        e.Ignore(x => x.MaxSellable);
        e.Ignore(x => x.Committed);
        e.Ignore(x => x.Remaining);
        // Database-level guarantee: stock can never go negative and commitments can never exceed sellable quantity.
        e.ToTable(t => t.HasCheckConstraint("CK_DailyInventories_Quantities",
            "[PlannedQuantity] >= 0 AND [SafetyBuffer] >= 0 AND [ReservedQuantity] >= 0 AND [CollectedQuantity] >= 0 " +
            "AND [NoShowQuantity] >= 0 AND [PlannedQuantity] - [SafetyBuffer] >= [ReservedQuantity] + [CollectedQuantity] + [NoShowQuantity]"));
    }
}

internal sealed class CustomerContactConfig : IEntityTypeConfiguration<CustomerContact>
{
    public void Configure(EntityTypeBuilder<CustomerContact> e)
    {
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.Property(x => x.FirstName).HasMaxLength(80).IsRequired();
        e.Property(x => x.LastName).HasMaxLength(80);
        e.Property(x => x.Email).HasMaxLength(254).IsRequired();
        e.Property(x => x.Phone).HasMaxLength(30);
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId);
    }
}

internal sealed class OrderConfig : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> e)
    {
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.Property(x => x.PublicReference).HasMaxLength(12).IsRequired();
        e.Property(x => x.AccessTokenHash).HasMaxLength(64).IsRequired();
        e.Property(x => x.Currency).HasMaxLength(3);
        e.Property(x => x.CustomerNote).HasMaxLength(500);
        e.Property(x => x.CancellationReason).HasMaxLength(500);
        e.Property(x => x.RowVersion).IsRowVersion();
        e.HasIndex(x => x.PublicReference).IsUnique().HasDatabaseName("IX_Orders_PublicReference");
        e.HasIndex(x => new { x.TenantId, x.LocationId, x.PickupDate, x.Status });
        e.HasIndex(x => new { x.TenantId, x.CreatedAt });
        e.HasIndex(x => new { x.Status, x.PickupStartUtc });
        e.HasOne(x => x.Location).WithMany()
            .HasForeignKey(x => new { x.TenantId, x.LocationId })
            .HasPrincipalKey(l => new { l.TenantId, l.Id });
        e.HasOne(x => x.Customer).WithMany()
            .HasForeignKey(x => new { x.TenantId, x.CustomerContactId })
            .HasPrincipalKey(c => new { c.TenantId, c.Id });
        e.HasMany(x => x.Items).WithOne()
            .HasForeignKey(i => new { i.TenantId, i.OrderId })
            .HasPrincipalKey(o => new { o.TenantId, o.Id });
        e.HasMany(x => x.History).WithOne()
            .HasForeignKey(h => new { h.TenantId, h.OrderId })
            .HasPrincipalKey(o => new { o.TenantId, o.Id });
        e.ToTable(t => t.HasCheckConstraint("CK_Orders_Amounts", "[Subtotal] >= 0 AND [Total] >= 0 AND [ItemCount] > 0"));
    }
}

internal sealed class OrderItemConfig : IEntityTypeConfiguration<OrderItem>
{
    public void Configure(EntityTypeBuilder<OrderItem> e)
    {
        e.Property(x => x.ProductName).HasMaxLength(120).IsRequired();
        e.Property(x => x.TaxRate).HasPrecision(5, 2);
        e.HasIndex(x => new { x.TenantId, x.ProductId });
        e.HasOne<Product>().WithMany()
            .HasForeignKey(x => new { x.TenantId, x.ProductId })
            .HasPrincipalKey(p => new { p.TenantId, p.Id });
        e.HasOne<DailyInventory>().WithMany().HasForeignKey(x => x.DailyInventoryId);
        e.ToTable(t => t.HasCheckConstraint("CK_OrderItems_Quantity", "[Quantity] > 0 AND [UnitPrice] >= 0 AND [LineTotal] >= 0"));
    }
}

internal sealed class OrderStatusHistoryConfig : IEntityTypeConfiguration<OrderStatusHistory>
{
    public void Configure(EntityTypeBuilder<OrderStatusHistory> e)
    {
        e.Property(x => x.Actor).HasMaxLength(20);
        e.Property(x => x.Note).HasMaxLength(500);
        e.HasIndex(x => x.OrderId);
    }
}

internal sealed class IdempotencyConfig : IEntityTypeConfiguration<ReservationIdempotencyRecord>
{
    public void Configure(EntityTypeBuilder<ReservationIdempotencyRecord> e)
    {
        e.Property(x => x.Key).HasMaxLength(100).IsRequired();
        e.Property(x => x.RequestHash).HasMaxLength(64).IsRequired();
        e.HasIndex(x => x.Key).IsUnique().HasDatabaseName("IX_IdempotencyRecords_Key");
        e.HasIndex(x => x.ExpiresAt);
    }
}
