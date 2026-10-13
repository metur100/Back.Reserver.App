namespace BackReserve.Domain.Common;

/// <summary>Base type for all persisted entities. Ids are sequential GUIDs (v7) to keep SQL Server indexes healthy.</summary>
public abstract class Entity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
}

/// <summary>Marks an entity that belongs to exactly one tenant. Every query on such an entity must be tenant scoped.</summary>
public interface ITenantOwned
{
    Guid TenantId { get; }
}

public interface IAuditableTimestamps
{
    DateTimeOffset CreatedAt { get; set; }
    DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Raised when a business rule is violated. Mapped to HTTP 409/422 by the API layer.</summary>
public class DomainException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
