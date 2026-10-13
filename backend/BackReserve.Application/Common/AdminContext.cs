using BackReserve.Domain.Enums;

namespace BackReserve.Application.Common;

/// <summary>
/// Authorisation context of a bakery user for the current request: the tenant resolved from a verified membership,
/// the effective permissions and the locations the user may access. Built server side; never taken from the client.
/// </summary>
public sealed class AdminContext
{
    public required Guid UserId { get; init; }
    public required Guid TenantId { get; init; }
    public required Guid MembershipId { get; init; }
    public required MembershipRole Role { get; init; }
    public required Permission Permissions { get; init; }
    /// <summary>Null means all locations of the tenant (owners).</summary>
    public required IReadOnlySet<Guid>? LocationIds { get; init; }
    public required bool IsReadOnly { get; init; }

    public bool AllLocations => LocationIds is null;

    public bool Has(Permission permission) => (Permissions & permission) == permission;

    public void Require(Permission permission)
    {
        if (!Has(permission)) throw new ForbiddenException();
    }

    public bool CanAccessLocation(Guid locationId) => LocationIds is null || LocationIds.Contains(locationId);

    /// <summary>Use for location ids supplied as filters or in request bodies.</summary>
    public void EnsureLocation(Guid locationId)
    {
        if (!CanAccessLocation(locationId))
            throw new ForbiddenException("Kein Zugriff auf diesen Standort.", "location_forbidden");
    }
}

/// <summary>Scoped holder populated by the API's tenant-membership filter before any admin service runs.</summary>
public interface IAdminContextAccessor
{
    AdminContext Context { get; }
    void Set(AdminContext context);
}

public sealed class AdminContextAccessor : IAdminContextAccessor
{
    private AdminContext? _context;

    public AdminContext Context =>
        _context ?? throw new ForbiddenException("Kein Bäckerei-Kontext für diese Anfrage.", "no_tenant_context");

    public void Set(AdminContext context) => _context = context;
}
