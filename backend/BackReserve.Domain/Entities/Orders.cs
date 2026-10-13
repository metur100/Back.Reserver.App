using BackReserve.Domain.Common;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;

namespace BackReserve.Domain.Entities;

public class Order : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid LocationId { get; set; }
    /// <summary>Short, human friendly reference such as BR-7K4M9X. Unique, but never sufficient on its own for public access.</summary>
    public string PublicReference { get; set; } = "";
    /// <summary>SHA-256 of the high-entropy capability token that authorises customer self-service.</summary>
    public string AccessTokenHash { get; set; } = "";
    public Guid CustomerContactId { get; set; }
    public DateOnly PickupDate { get; set; }
    public TimeOnly SlotStart { get; set; }
    public TimeOnly SlotEnd { get; set; }
    public DateTimeOffset PickupStartUtc { get; set; }
    public DateTimeOffset PickupEndUtc { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Confirmed;
    public PaymentMode PaymentMode { get; set; } = PaymentMode.PayAtPickup;
    public decimal Subtotal { get; set; }
    public decimal Total { get; set; }
    public string Currency { get; set; } = "EUR";
    public int ItemCount { get; set; }
    public string? CustomerNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PreparingAt { get; set; }
    public DateTimeOffset? ReadyAt { get; set; }
    public DateTimeOffset? CollectedAt { get; set; }
    public Guid? CollectedByUserId { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public CancellationActor? CancelledBy { get; set; }
    public string? CancellationReason { get; set; }
    public DateTimeOffset? NoShowAt { get; set; }
    public DateTimeOffset? ReminderSentAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public BakeryLocation Location { get; set; } = null!;
    public CustomerContact Customer { get; set; } = null!;
    public ICollection<OrderItem> Items { get; set; } = [];
    public ICollection<OrderStatusHistory> History { get; set; } = [];

    public bool IsActive => OrderStateMachine.IsActive(Status);
}

/// <summary>Order line with name and price snapshotted at order time. Totals are never recomputed from the catalog.</summary>
public class OrderItem : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid OrderId { get; set; }
    public Guid ProductId { get; set; }
    public Guid DailyInventoryId { get; set; }
    public string ProductName { get; set; } = "";
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
    /// <summary>Reserved for later tax reporting. Null until VAT handling is implemented.</summary>
    public decimal? TaxRate { get; set; }
}

public class OrderStatusHistory : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid OrderId { get; set; }
    public OrderStatus? FromStatus { get; set; }
    public OrderStatus ToStatus { get; set; }
    public Guid? ChangedByUserId { get; set; }
    /// <summary>"Customer", "Staff" or "System".</summary>
    public string Actor { get; set; } = "";
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Customer contact data kept separate from the order so it can be anonymised without touching order history.</summary>
public class CustomerContact : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public string FirstName { get; set; } = "";
    public string? LastName { get; set; }
    public string Email { get; set; } = "";
    public string? Phone { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? AnonymizedAt { get; set; }
}

public class ReservationIdempotencyRecord : Entity
{
    public string Key { get; set; } = "";
    /// <summary>SHA-256 of the canonical request so a reused key with a different body is rejected.</summary>
    public string RequestHash { get; set; } = "";
    public Guid OrderId { get; set; }
    /// <summary>Data-protected copy of the original response (contains the capability token) for safe replays.</summary>
    public string ProtectedResponse { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
