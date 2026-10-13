using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using BackReserve.Api.Infrastructure;
using BackReserve.Application.Contracts;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using BackReserve.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BackReserve.IntegrationTests.Infrastructure;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(), new TimeOnlyHhMmConverter() },
    };
}

public sealed record TestProduct(Guid Id, string Name, decimal Price, Guid InventoryId);

public sealed class TestBakery
{
    public required Guid TenantId { get; init; }
    public required string Slug { get; init; }
    public required Guid LocationId { get; init; }
    public required Guid SecondLocationId { get; init; }
    public required DateOnly PickupDate { get; init; }
    public required TimeOnly Slot { get; init; }
    public required List<TestProduct> Products { get; init; }
    public required Guid DraftProductId { get; init; }
    public required string OwnerEmail { get; init; }
    public required string ManagerEmail { get; init; }
    public required string StaffEmail { get; init; }
    /// <summary>Staff member assigned only to the second location.</summary>
    public required string OtherLocationStaffEmail { get; init; }
    public const string Password = "Test-Passwort-2026";
}

/// <summary>Creates a fully isolated bakery per test so tests never share stock or orders.</summary>
public sealed class TestDataBuilder(ApiFactory factory)
{
    public async Task<TestBakery> CreateBakeryAsync(int stockPerProduct = 20, int maxOrdersPerSlot = 50, int? maxItemsPerSlot = null,
        int productCount = 2, string planCode = "business")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var now = factory.Clock.GetUtcNow();
        var id = Guid.NewGuid().ToString("N")[..10];
        var plan = await db.SubscriptionPlans.FirstAsync(p => p.Code == planCode);

        var tenant = new Tenant { Name = $"Testbäckerei {id}", Slug = $"test-{id}", IsPublished = true, CreatedAt = now, UpdatedAt = now };
        tenant.Settings = new TenantSettings { TenantId = tenant.Id, RequireCustomerLastName = false };
        tenant.Subscription = new Subscription { TenantId = tenant.Id, PlanId = plan.Id, Status = SubscriptionStatus.Trial, CreatedAt = now, UpdatedAt = now };
        db.Tenants.Add(tenant);

        BakeryLocation NewLocation(string name)
        {
            var l = new BakeryLocation { TenantId = tenant.Id, Name = name, Street = "Teststraße 1", PostalCode = "40213", City = "Düsseldorf", CreatedAt = now, UpdatedAt = now };
            // Cutoff "0 days before at 23:59" and every weekday open: tests are independent of the current weekday and time.
            l.Settings = new LocationSettings
            {
                TenantId = tenant.Id, LocationId = l.Id, OrderCutoffDaysBefore = 0, OrderCutoffTime = new TimeOnly(23, 59), MinAdvanceMinutes = 0,
                MaxDaysAhead = 30, CancellationCutoffDaysBefore = 1, CancellationCutoffTime = new TimeOnly(18, 0),
            };
            db.Locations.Add(l);
            foreach (var day in Enum.GetValues<DayOfWeek>())
                db.PickupScheduleRules.Add(new PickupScheduleRule
                {
                    TenantId = tenant.Id, LocationId = l.Id, DayOfWeek = day, IsOpen = true, PickupStart = new TimeOnly(7, 0), PickupEnd = new TimeOnly(12, 0),
                    SlotMinutes = 30, MaxOrdersPerSlot = maxOrdersPerSlot, MaxItemsPerSlot = maxItemsPerSlot,
                });
            return l;
        }

        var location = NewLocation("Hauptfiliale");
        var second = NewLocation("Zweigstelle");

        var tz = PickupCalendar.ResolveTimeZone("Europe/Berlin");
        var pickupDate = PickupCalendar.LocalToday(now, tz).AddDays(3);
        var products = new List<TestProduct>();
        for (var i = 0; i < productCount; i++)
        {
            var p = new Product
            {
                TenantId = tenant.Id, Name = $"Produkt {i + 1}", Slug = $"produkt-{i + 1}", BasePrice = 1.90m + i, IsPublished = true,
                CreatedAt = now, UpdatedAt = now, DefaultDailyQuantity = 10,
            };
            db.Products.Add(p);
            var inv = new DailyInventory { TenantId = tenant.Id, LocationId = location.Id, ProductId = p.Id, Date = pickupDate, PlannedQuantity = stockPerProduct, UpdatedAt = now };
            db.DailyInventories.Add(inv);
            db.DailyInventories.Add(new DailyInventory { TenantId = tenant.Id, LocationId = second.Id, ProductId = p.Id, Date = pickupDate, PlannedQuantity = stockPerProduct, UpdatedAt = now });
            products.Add(new TestProduct(p.Id, p.Name, p.BasePrice, inv.Id));
        }
        var draft = new Product { TenantId = tenant.Id, Name = "Geheimer Entwurf", Slug = "geheimer-entwurf", BasePrice = 9m, IsPublished = false, CreatedAt = now, UpdatedAt = now };
        db.Products.Add(draft);
        db.DailyInventories.Add(new DailyInventory { TenantId = tenant.Id, LocationId = location.Id, ProductId = draft.Id, Date = pickupDate, PlannedQuantity = 10, UpdatedAt = now });

        async Task<ApplicationUser> User(string email)
        {
            var u = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, FirstName = "Test", LastName = email.Split('@')[0], CreatedAt = now };
            var r = await users.CreateAsync(u, TestBakery.Password);
            if (!r.Succeeded) throw new InvalidOperationException(string.Join(",", r.Errors.Select(e => e.Code)));
            return u;
        }
        var owner = await User($"owner-{id}@test.example");
        var manager = await User($"manager-{id}@test.example");
        var staff = await User($"staff-{id}@test.example");
        var otherStaff = await User($"staff2-{id}@test.example");
        db.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = owner.Id, Role = MembershipRole.Owner, CreatedAt = now });
        void Member(ApplicationUser u, MembershipRole role, Guid locationId)
        {
            var m = new TenantMembership { TenantId = tenant.Id, UserId = u.Id, Role = role, CreatedAt = now };
            db.TenantMemberships.Add(m);
            db.LocationMemberships.Add(new LocationMembership { TenantId = tenant.Id, TenantMembershipId = m.Id, LocationId = locationId });
        }
        Member(manager, MembershipRole.Manager, location.Id);
        Member(staff, MembershipRole.Staff, location.Id);
        Member(otherStaff, MembershipRole.Staff, second.Id);

        await db.SaveChangesAsync();
        return new TestBakery
        {
            TenantId = tenant.Id, Slug = tenant.Slug, LocationId = location.Id, SecondLocationId = second.Id, PickupDate = pickupDate,
            Slot = new TimeOnly(8, 0), Products = products, DraftProductId = draft.Id, OwnerEmail = owner.Email!, ManagerEmail = manager.Email!,
            StaffEmail = staff.Email!, OtherLocationStaffEmail = otherStaff.Email!,
        };
    }

    public async Task<DailyInventory> GetInventoryAsync(Guid inventoryId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.DailyInventories.AsNoTracking().FirstAsync(i => i.Id == inventoryId);
    }

    public async Task<T> QueryAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        using var scope = factory.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
}

public static class HttpExtensions
{
    public static CreateOrderRequest OrderRequest(this TestBakery b, params (int Product, int Qty)[] lines) => new(
        b.LocationId, b.PickupDate, b.Slot,
        lines.Select(l => new CreateOrderItemRequest(b.Products[l.Product].Id, l.Qty)).ToList(),
        new CustomerDetailsRequest("Erika", "Musterfrau", "erika@kunde.example", null), null, true);

    public static async Task<HttpResponseMessage> PostOrderAsync(this HttpClient client, CreateOrderRequest request, string? idempotencyKey = null)
    {
        using var msg = new HttpRequestMessage(HttpMethod.Post, "/api/v1/public/orders") { Content = JsonContent.Create(request, options: Json.Options) };
        if (idempotencyKey is not null) msg.Headers.Add("Idempotency-Key", idempotencyKey);
        return await client.SendAsync(msg);
    }

    public static async Task<HttpResponseMessage> SendJsonAsync(this HttpClient client, HttpMethod method, string url, object? body = null,
        string? bearer = null, Guid? tenantId = null, IDictionary<string, string>? headers = null)
    {
        using var msg = new HttpRequestMessage(method, url);
        if (body is not null) msg.Content = JsonContent.Create(body, body.GetType(), options: Json.Options);
        if (bearer is not null) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        if (tenantId is not null) msg.Headers.Add("X-Tenant-Id", tenantId.Value.ToString());
        if (headers is not null) foreach (var (k, v) in headers) msg.Headers.Add(k, v);
        return await client.SendAsync(msg);
    }

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Expected success but got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>(Json.Options))!;
    }

    public static async Task<string?> ErrorCodeAsync(this HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(text)) return null;
        return JsonNode.Parse(text)?["code"]?.GetValue<string>();
    }

    public static async Task<string> LoginAsync(this HttpClient client, string email, string password = TestBakery.Password)
    {
        var response = await client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(email, password),
            headers: new Dictionary<string, string> { ["X-Client-Type"] = "mobile" });
        return (await response.ReadAsync<AuthResponse>()).AccessToken;
    }

    public static void AssertStatus(this HttpResponseMessage response, HttpStatusCode expected)
    {
        if (response.StatusCode != expected)
            throw new Xunit.Sdk.XunitException($"Expected {(int)expected} but got {(int)response.StatusCode}: {response.Content.ReadAsStringAsync().Result}");
    }
}
