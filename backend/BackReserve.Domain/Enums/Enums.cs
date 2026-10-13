namespace BackReserve.Domain.Enums;

public enum TenantStatus
{
    Active = 0,
    Suspended = 1,
}

public enum SubscriptionStatus
{
    Trial = 0,
    Active = 1,
    PastDue = 2,
    Cancelled = 3,
    Suspended = 4,
}

public enum MembershipRole
{
    Owner = 0,
    Manager = 1,
    Staff = 2,
}

/// <summary>Fine-grained permissions. Roles map to default sets; staff permissions can be narrowed per membership.</summary>
[Flags]
public enum Permission
{
    None = 0,
    OrdersView = 1 << 0,
    OrdersProcess = 1 << 1,
    PickupCollect = 1 << 2,
    OrdersCancel = 1 << 3,
    CustomerContactView = 1 << 4,
    ProductsManage = 1 << 5,
    InventoryManage = 1 << 6,
    LocationsManage = 1 << 7,
    PickupScheduleManage = 1 << 8,
    StaffManage = 1 << 9,
    ReportsView = 1 << 10,
    SettingsManage = 1 << 11,
    SubscriptionManage = 1 << 12,
}

public enum OrderStatus
{
    Confirmed = 1,
    Preparing = 2,
    ReadyForPickup = 3,
    Collected = 4,
    Cancelled = 5,
    NoShow = 6,
}

public enum PaymentMode
{
    PayAtPickup = 0,
}

public enum CancellationActor
{
    Customer = 0,
    Bakery = 1,
}

public enum NotificationType
{
    NewOrder = 0,
    OrderCancelledByCustomer = 1,
    PickupProblem = 2,
}
