using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Common;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using BackReserve.Infrastructure.Identity;
using BackReserve.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Api.Infrastructure;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public Guid? UserId =>
        Guid.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier) ?? Principal?.FindFirstValue("sub"), out var id) ? id : null;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public bool IsPlatformAdmin => Principal?.IsInRole(AppRoles.PlatformAdmin) == true;
}

/// <summary>
/// Resolves the bakery context for /api/v1/admin requests from a verified, active membership. The tenant id in the
/// X-Tenant-Id header is only a selector; it is never trusted without a matching membership row.
/// </summary>
public sealed class TenantMemberFilter(AppDbContext db, ICurrentUser currentUser, IAdminContextAccessor accessor) : IAsyncActionFilter
{
    public const string TenantHeader = "X-Tenant-Id";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var userId = currentUser.UserId ?? throw new UnauthorizedAppException();
        var ct = context.HttpContext.RequestAborted;

        var query = db.TenantMemberships.AsNoTracking().Where(m => m.UserId == userId && m.IsActive);
        var header = context.HttpContext.Request.Headers[TenantHeader].ToString();
        if (!string.IsNullOrEmpty(header))
        {
            if (!Guid.TryParse(header, out var requested)) throw new ForbiddenException("Ungültiger Bäckerei-Kontext.", "invalid_tenant");
            query = query.Where(m => m.TenantId == requested);
        }

        var memberships = await query
            .Select(m => new
            {
                m.Id, m.TenantId, m.Role, m.CustomPermissions, TenantStatus = m.Tenant.Status,
                SubscriptionStatus = (SubscriptionStatus?)m.Tenant.Subscription!.Status,
                Locations = m.Locations.Select(l => l.LocationId).ToList(),
            })
            .OrderBy(m => m.Id).Take(2).ToListAsync(ct);
        if (memberships.Count == 0) throw new ForbiddenException("Sie gehören zu keiner Bäckerei bzw. nicht zu dieser.", "no_membership");
        if (memberships.Count > 1) throw new ForbiddenException("Bitte wählen Sie eine Bäckerei aus (X-Tenant-Id).", "tenant_selection_required");

        var m = memberships[0];
        var readOnly = m.TenantStatus == TenantStatus.Suspended ||
                       (m.SubscriptionStatus is { } s && PublicCatalogBlocked(s));
        accessor.Set(new AdminContext
        {
            UserId = userId,
            TenantId = m.TenantId,
            MembershipId = m.Id,
            Role = m.Role,
            Permissions = RolePermissions.Effective(m.Role, m.CustomPermissions),
            LocationIds = m.Role == MembershipRole.Owner ? null : m.Locations.ToHashSet(),
            IsReadOnly = readOnly,
        });

        if (readOnly && !HttpMethods.IsGet(context.HttpContext.Request.Method))
            throw new ForbiddenException("Dieses Konto ist gesperrt oder das Abonnement ist beendet. Änderungen sind nicht möglich.", "tenant_read_only");

        await next();
    }

    private static bool PublicCatalogBlocked(SubscriptionStatus s) => s is SubscriptionStatus.Cancelled or SubscriptionStatus.Suspended;
}

/// <summary>Runs FluentValidation for every action argument that has a registered validator.</summary>
public sealed class ValidationFilter(IServiceProvider services) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        foreach (var argument in context.ActionArguments.Values)
        {
            if (argument is null) continue;
            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());
            if (services.GetService(validatorType) is not IValidator validator) continue;
            var result = await validator.ValidateAsync(new ValidationContext<object>(argument), context.HttpContext.RequestAborted);
            if (!result.IsValid) throw new ValidationException(result.Errors);
        }
        await next();
    }
}

public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> logger, IHostEnvironment env) : IExceptionHandler
{
    /// <summary>"Customer.FirstName" / "Items[0].Quantity" -> "customer.firstName" / "items[0].quantity" to match the JSON contract.</summary>
    internal static string CamelCasePath(string path) =>
        string.Join('.', path.Split('.').Select(JsonNamingPolicy.CamelCase.ConvertName));

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken ct)
    {
        ProblemDetails problem;
        switch (exception)
        {
            case AppException app:
                problem = new ProblemDetails { Status = app.StatusCode, Title = app.Message, Type = $"https://backreserve.example/errors/{app.Code}" };
                problem.Extensions["code"] = app.Code;
                foreach (var (k, v) in app.Extensions) problem.Extensions[k] = v;
                break;
            case ValidationException validation:
                problem = new ValidationProblemDetails(validation.Errors
                    .GroupBy(e => CamelCasePath(e.PropertyName))
                    .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray()))
                {
                    Status = 400, Title = "Bitte überprüfe deine Eingaben.", Type = "https://backreserve.example/errors/validation",
                };
                problem.Extensions["code"] = "validation_failed";
                break;
            case DomainException domain:
                problem = new ProblemDetails { Status = 409, Title = domain.Message };
                problem.Extensions["code"] = domain.Code;
                break;
            case DbUpdateConcurrencyException:
                problem = new ProblemDetails { Status = 409, Title = "Die Daten wurden zwischenzeitlich geändert. Bitte neu laden." };
                problem.Extensions["code"] = "concurrency_conflict";
                break;
            case BadHttpRequestException bad:
                problem = new ProblemDetails { Status = bad.StatusCode, Title = "Ungültige Anfrage." };
                problem.Extensions["code"] = "bad_request";
                break;
            case OperationCanceledException when httpContext.RequestAborted.IsCancellationRequested:
                return true;
            default:
                logger.LogError(exception, "Unhandled exception for {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
                problem = new ProblemDetails { Status = 500, Title = "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später erneut." };
                problem.Extensions["code"] = "internal_error";
                if (env.IsDevelopment()) problem.Detail = exception.ToString();
                break;
        }
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;
        httpContext.Response.StatusCode = problem.Status ?? 500;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = problem, Exception = exception });
    }
}

/// <summary>Serialises TimeOnly as "HH:mm" (accepts "HH:mm" and "HH:mm:ss").</summary>
public sealed class TimeOnlyHhMmConverter : JsonConverter<TimeOnly>
{
    public override TimeOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var s = reader.GetString();
        if (TimeOnly.TryParseExact(s, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var t)) return t;
        throw new JsonException("Ungültiges Zeitformat, erwartet HH:mm.");
    }

    public override void Write(Utf8JsonWriter writer, TimeOnly value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString("HH:mm", CultureInfo.InvariantCulture));
}

public static class SecurityHeaders
{
    public static IApplicationBuilder UseBackReserveSecurityHeaders(this IApplicationBuilder app) => app.Use(async (ctx, next) =>
    {
        ctx.Response.OnStarting(() =>
        {
            var h = ctx.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["Referrer-Policy"] = "no-referrer";
            h["X-Frame-Options"] = "DENY";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            h["Cross-Origin-Resource-Policy"] = "cross-origin";
            if (!ctx.Request.Path.StartsWithSegments("/swagger"))
                h["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'";
            if (ctx.Request.Path.StartsWithSegments("/api")) h.CacheControl = "no-store";
            return Task.CompletedTask;
        });
        await next();
    });
}
