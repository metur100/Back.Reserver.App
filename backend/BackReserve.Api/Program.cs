using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using BackReserve.Api.Infrastructure;
using BackReserve.Application;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Validation;
using BackReserve.Infrastructure;
using BackReserve.Infrastructure.Identity;
using BackReserve.Infrastructure.Persistence;
using BackReserve.Infrastructure.Persistence.Seeding;
using BackReserve.Infrastructure.Storage;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders();
    builder.Logging.AddJsonConsole(o => { o.IncludeScopes = true; o.UseUtcTimestamp = true; });
}

builder.Services.AddApplication();
builder.Services.AddInfrastructure(config);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<TenantMemberFilter>();
builder.Services.AddValidatorsFromAssemblyContaining<CreateOrderRequestValidator>();
ValidatorOptions.Global.LanguageManager.Culture = new System.Globalization.CultureInfo("de");

builder.Services.AddControllers(o => o.Filters.Add<ValidationFilter>())
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        o.JsonSerializerOptions.Converters.Add(new TimeOnlyHhMmConverter());
        o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    });
// Malformed JSON / wrong types fail during model binding, before FluentValidation runs. Answer them in the same
// contract as validation errors: German title, code "validation_failed", camelCase field paths.
builder.Services.Configure<Microsoft.AspNetCore.Mvc.ApiBehaviorOptions>(o => o.InvalidModelStateResponseFactory = ctx =>
{
    var errors = ctx.ModelState
        .Where(e => e.Value?.Errors.Count > 0)
        .GroupBy(e => ApiExceptionHandler.CamelCasePath(e.Key.StartsWith("$.") ? e.Key[2..] : e.Key.TrimStart('$')))
        .ToDictionary(g => g.Key.Length == 0 ? "body" : g.Key,
            _ => new[] { "Ungültiger oder fehlender Wert." });
    var problem = new Microsoft.AspNetCore.Mvc.ValidationProblemDetails(errors)
    {
        Status = StatusCodes.Status400BadRequest,
        Title = "Die Anfrage ist ungültig. Bitte überprüfe deine Eingaben.",
        Type = "https://backreserve.example/errors/validation",
    };
    problem.Extensions["code"] = "validation_failed";
    problem.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
    return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(problem) { ContentTypes = { "application/problem+json" } };
});
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

// ---------- Authentication ----------
var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = true;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = jwt.Issuer,
        ValidateAudience = true, ValidAudience = jwt.Audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = TokenService.Key(jwt),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30),
    };
});
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("PlatformAdmin", p => p.RequireRole(AppRoles.PlatformAdmin));

// ---------- CORS (explicit origins only) ----------
var origins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()
    .WithExposedHeaders("Content-Disposition")));

// ---------- Rate limiting ----------
var rateLimitingEnabled = config.GetValue("RateLimiting:Enabled", true);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/problem+json";
        await ctx.HttpContext.Response.WriteAsync(
            """{"status":429,"title":"Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.","code":"rate_limited"}""", ct);
    };
    RateLimitPartition<string> PerIp(HttpContext ctx, string policy, int permits, TimeSpan window) =>
        !rateLimitingEnabled
            ? RateLimitPartition.GetNoLimiter(policy)
            : RateLimitPartition.GetFixedWindowLimiter($"{policy}:{ctx.Connection.RemoteIpAddress}", _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permits, Window = window, QueueLimit = 0,
            });
    o.AddPolicy("public-read", ctx => PerIp(ctx, "public-read", 240, TimeSpan.FromMinutes(1)));
    o.AddPolicy("public-orders", ctx => PerIp(ctx, "public-orders", 10, TimeSpan.FromMinutes(1)));
    o.AddPolicy("order-lookup", ctx => PerIp(ctx, "order-lookup", 30, TimeSpan.FromMinutes(1)));
    o.AddPolicy("auth", ctx => PerIp(ctx, "auth", 20, TimeSpan.FromMinutes(1)));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => PerIp(ctx, "global", 600, TimeSpan.FromMinutes(1)));
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Trusted proxies must be configured explicitly in production (see docs/DEPLOYMENT.md).
    foreach (var proxy in config.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
        o.KnownProxies.Add(System.Net.IPAddress.Parse(proxy));
});

builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database", tags: ["ready"]);

builder.Services.AddOpenApi(o => o.AddDocumentTransformer((doc, _, _) =>
{
    doc.Info = new OpenApiInfo { Title = "BackReserve API", Version = "v1", Description = "Vorbestellung und Abholung für Bäckereien." };
    doc.Components ??= new OpenApiComponents();
    doc.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
    doc.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT", Description = "Access token from /api/v1/auth/login",
    };
    return Task.CompletedTask;
}));

builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 8 * 1024 * 1024);

var app = builder.Build();

// ---------- Database migration & seeding ----------
var migrateOnly = args.Contains("--migrate-only");
if (migrateOnly || app.Environment.IsDevelopment() || config.GetValue("Database:MigrateOnStartup", false))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    var seeder = scope.ServiceProvider.GetRequiredService<DataSeeder>();
    await seeder.SeedReferenceDataAsync(CancellationToken.None);
    if (app.Environment.IsDevelopment() || config.GetValue("Seed:AllowOutsideDevelopment", false))
        await seeder.SeedDemoDataAsync(CancellationToken.None);
    if (migrateOnly)
    {
        app.Logger.LogInformation("Migrations applied; exiting because --migrate-only was specified.");
        return;
    }
}

if (config.GetValue("ForwardedHeaders:Enabled", false)) app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    // Health probes from the hosting platform arrive over plain HTTP inside the network and must not be redirected.
    app.UseWhen(ctx => !ctx.Request.Path.StartsWithSegments("/health"), b => b.UseHttpsRedirection());
}
app.UseBackReserveSecurityHeaders();

// Demo images (wwwroot/media/demo) and uploaded images: served as static, non-executable files.
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=86400",
});
var storage = app.Services.GetRequiredService<IOptions<StorageOptions>>().Value;
var uploadRoot = app.Services.GetRequiredService<LocalFileStorage>().RootPath;
Directory.CreateDirectory(uploadRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadRoot),
    RequestPath = storage.PublicPathPrefix,
    ServeUnknownFileTypes = false,
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=604800, immutable",
});

app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(o =>
    {
        o.SwaggerEndpoint("/openapi/v1.json", "BackReserve API v1");
        o.RoutePrefix = "swagger";
    });
}

app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
app.MapControllers();

app.Run();

public partial class Program;
