namespace BackReserve.Application.Common;

/// <summary>Base for errors that map to a specific HTTP status with a stable, machine-readable code and a German message.</summary>
public abstract class AppException(int statusCode, string code, string message, IDictionary<string, object?>? extensions = null)
    : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;
    public IDictionary<string, object?> Extensions { get; } = extensions ?? new Dictionary<string, object?>();
}

public sealed class NotFoundException(string message = "Nicht gefunden.", string code = "not_found")
    : AppException(404, code, message);

public sealed class ForbiddenException(string message = "Keine Berechtigung für diese Aktion.", string code = "forbidden")
    : AppException(403, code, message);

public sealed class ConflictException(string code, string message, IDictionary<string, object?>? extensions = null)
    : AppException(409, code, message, extensions);

public sealed class BusinessRuleException(string code, string message, IDictionary<string, object?>? extensions = null)
    : AppException(422, code, message, extensions);

public sealed class UnauthorizedAppException(string message = "Anmeldung erforderlich.", string code = "unauthorized")
    : AppException(401, code, message);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed record PageQuery(int Page = 1, int PageSize = 25)
{
    public int SafePage => Math.Max(1, Page);
    public int SafePageSize => Math.Clamp(PageSize, 1, 100);
    public int Skip => (SafePage - 1) * SafePageSize;
}
