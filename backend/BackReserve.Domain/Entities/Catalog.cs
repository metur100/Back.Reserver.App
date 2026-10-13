using BackReserve.Domain.Common;

namespace BackReserve.Domain.Entities;

public class ProductCategory : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Product : Entity, ITenantOwned, IAuditableTimestamps
{
    public Guid TenantId { get; set; }
    public Guid? CategoryId { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public string Currency { get; set; } = "EUR";
    public string? ImageUrl { get; set; }
    public bool IsPublished { get; set; }
    /// <summary>Archived products are hidden everywhere except historical orders. Products are never hard-deleted.</summary>
    public bool IsArchived { get; set; }
    /// <summary>Allergen information exactly as supplied by the bakery. Never inferred.</summary>
    public string? Allergens { get; set; }
    public string? Ingredients { get; set; }
    /// <summary>Comma separated labels such as "vegan,laktosefrei" supplied by the bakery.</summary>
    public string? DietaryLabels { get; set; }
    /// <summary>Minimum hours between ordering and pickup for this product (e.g. 48 for celebration cakes).</summary>
    public int LeadTimeHours { get; set; }
    /// <summary>Optional default daily quantity used when the bakery fills a day from defaults.</summary>
    public int? DefaultDailyQuantity { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public ProductCategory? Category { get; set; }
}

/// <summary>
/// Sellable stock for one product at one location on one pickup date (the "product availability" record).
/// Remaining = Planned - SafetyBuffer - Reserved - Collected - NoShow, enforced by a CHECK constraint and by
/// conditional UPDATE statements; the application never does read-then-write stock checks.
/// </summary>
public class DailyInventory : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid LocationId { get; set; }
    public Guid ProductId { get; set; }
    public DateOnly Date { get; set; }
    public int PlannedQuantity { get; set; }
    public int SafetyBuffer { get; set; }
    /// <summary>Units held by active orders (Confirmed, Preparing, ReadyForPickup).</summary>
    public int ReservedQuantity { get; set; }
    /// <summary>Units handed over to customers.</summary>
    public int CollectedQuantity { get; set; }
    /// <summary>Units of orders that were marked as no-show. They stay committed (the goods were produced).</summary>
    public int NoShowQuantity { get; set; }
    /// <summary>Bakery switched the product off for this day. Blocks new reservations, keeps existing ones.</summary>
    public bool IsUnavailable { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Product Product { get; set; } = null!;
    public BakeryLocation Location { get; set; } = null!;

    public int MaxSellable => Math.Max(0, PlannedQuantity - SafetyBuffer);
    public int Committed => ReservedQuantity + CollectedQuantity + NoShowQuantity;
    public int Remaining => IsUnavailable ? 0 : Math.Max(0, MaxSellable - Committed);
}
