using BackReserve.Domain.Enums;

namespace BackReserve.Domain.Rules;

public static class RolePermissions
{
    public const Permission StaffDefault =
        Permission.OrdersView | Permission.OrdersProcess | Permission.PickupCollect;

    public const Permission ManagerDefault =
        StaffDefault | Permission.OrdersCancel | Permission.CustomerContactView | Permission.ProductsManage |
        Permission.InventoryManage | Permission.PickupScheduleManage | Permission.ReportsView;

    public const Permission OwnerAll =
        ManagerDefault | Permission.LocationsManage | Permission.StaffManage | Permission.SettingsManage |
        Permission.SubscriptionManage;

    /// <summary>The maximum a role may ever hold. Custom grants are intersected with this ceiling.</summary>
    public static Permission Ceiling(MembershipRole role) => role switch
    {
        MembershipRole.Owner => OwnerAll,
        // Managers never get ownership, subscription or staff administration automatically.
        MembershipRole.Manager => ManagerDefault,
        MembershipRole.Staff => StaffDefault | Permission.OrdersCancel | Permission.CustomerContactView,
        _ => Permission.None,
    };

    public static Permission Default(MembershipRole role) => role switch
    {
        MembershipRole.Owner => OwnerAll,
        MembershipRole.Manager => ManagerDefault,
        MembershipRole.Staff => StaffDefault,
        _ => Permission.None,
    };

    public static Permission Effective(MembershipRole role, Permission? custom) =>
        role == MembershipRole.Owner ? OwnerAll : (custom ?? Default(role)) & Ceiling(role);
}
