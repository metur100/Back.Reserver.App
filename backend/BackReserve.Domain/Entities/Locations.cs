using BackReserve.Domain.Common;

namespace BackReserve.Domain.Entities;

public class BakeryLocation : Entity, ITenantOwned, IAuditableTimestamps
{
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public string Street { get; set; } = "";
    public string PostalCode { get; set; } = "";
    public string City { get; set; } = "";
    public string Country { get; set; } = "DE";
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Tenant Tenant { get; set; } = null!;
    public LocationSettings Settings { get; set; } = null!;
    public ICollection<PickupScheduleRule> ScheduleRules { get; set; } = [];
    public ICollection<LocationClosure> Closures { get; set; } = [];
}

/// <summary>Ordering policy of one location. All times are wall-clock times in <see cref="TimeZoneId"/>.</summary>
public class LocationSettings : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid LocationId { get; set; }
    /// <summary>IANA time zone id, e.g. "Europe/Berlin".</summary>
    public string TimeZoneId { get; set; } = "Europe/Berlin";
    public bool AcceptsOrders { get; set; } = true;
    /// <summary>Orders for day D must be placed before <see cref="OrderCutoffTime"/> on day D - <see cref="OrderCutoffDaysBefore"/>.</summary>
    public int OrderCutoffDaysBefore { get; set; } = 1;
    public TimeOnly OrderCutoffTime { get; set; } = new(18, 0);
    /// <summary>Minimum minutes between order placement and slot start (applies in addition to the cutoff).</summary>
    public int MinAdvanceMinutes { get; set; } = 60;
    public int MaxDaysAhead { get; set; } = 14;
    /// <summary>Customers may cancel until this time on day D - <see cref="CancellationCutoffDaysBefore"/>.</summary>
    public int CancellationCutoffDaysBefore { get; set; } = 1;
    public TimeOnly CancellationCutoffTime { get; set; } = new(18, 0);
}

/// <summary>Weekly pickup schedule for one weekday at one location.</summary>
public class PickupScheduleRule : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid LocationId { get; set; }
    public DayOfWeek DayOfWeek { get; set; }
    public bool IsOpen { get; set; }
    public TimeOnly? OpensAt { get; set; }
    public TimeOnly? ClosesAt { get; set; }
    public TimeOnly PickupStart { get; set; } = new(7, 0);
    public TimeOnly PickupEnd { get; set; } = new(12, 0);
    public int SlotMinutes { get; set; } = 30;
    public int MaxOrdersPerSlot { get; set; } = 10;
    public int? MaxItemsPerSlot { get; set; }
}

public class LocationClosure : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid LocationId { get; set; }
    public DateOnly Date { get; set; }
    public string? Reason { get; set; }
}

/// <summary>
/// Authoritative capacity counter for one pickup slot. Rows are created lazily under a key-range lock and
/// incremented with a single conditional UPDATE so concurrent reservations can never exceed capacity.
/// </summary>
public class PickupSlotCounter : Entity, ITenantOwned
{
    public Guid TenantId { get; set; }
    public Guid LocationId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly SlotStart { get; set; }
    public int OrderCount { get; set; }
    public int ItemCount { get; set; }
}
