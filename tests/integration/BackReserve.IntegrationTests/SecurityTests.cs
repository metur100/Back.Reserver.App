using System.Net;
using System.Net.Http.Json;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Domain.Enums;
using BackReserve.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class SecurityTests(ApiFactory factory)
{
    private readonly TestDataBuilder _data = new(factory);
    private readonly HttpClient _client = factory.CreateApiClient();

    private async Task<(CreateOrderResponse Order, Guid OrderId)> PlaceOrderAsync(TestBakery bakery, Guid? location = null)
    {
        var request = bakery.OrderRequest((0, 1));
        if (location is { } l) request = request with { LocationId = l };
        var order = await (await _client.PostOrderAsync(request)).ReadAsync<CreateOrderResponse>();
        var id = await _data.QueryAsync(db => db.Orders.Where(o => o.PublicReference == order.Order.PublicReference).Select(o => o.Id).SingleAsync());
        return (order, id);
    }

    [Fact]
    public async Task Tenant_A_cannot_read_or_modify_tenant_B_orders()
    {
        var a = await _data.CreateBakeryAsync();
        var b = await _data.CreateBakeryAsync();
        var (orderB, orderBId) = await PlaceOrderAsync(b);
        var ownerA = await _client.LoginAsync(a.OwnerEmail);

        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderBId}", bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/lookup?code={orderB.Order.PublicReference}", bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderBId}/collect", bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderBId}/cancel", new OrderActionRequest("x"), bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);

        var listA = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/orders?pageSize=100", bearer: ownerA)).ReadAsync<PagedResult<OrderListItemDto>>();
        Assert.DoesNotContain(listA.Items, o => o.Id == orderBId);

        // Selecting tenant B via the header without a membership is refused.
        var forged = await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/orders", bearer: ownerA, tenantId: b.TenantId);
        forged.AssertStatus(HttpStatusCode.Forbidden);
        Assert.Equal("no_membership", await forged.ErrorCodeAsync());

        Assert.Equal(OrderStatus.Confirmed, await _data.QueryAsync(db => db.Orders.Where(o => o.Id == orderBId).Select(o => o.Status).SingleAsync()));
    }

    [Fact]
    public async Task Tenant_A_cannot_touch_tenant_B_products_inventory_locations_or_reports()
    {
        var a = await _data.CreateBakeryAsync();
        var b = await _data.CreateBakeryAsync();
        var ownerA = await _client.LoginAsync(a.OwnerEmail);
        var productB = b.Products[0].Id;

        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/products/{productB}", bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Put, $"/api/v1/admin/products/{productB}",
            new UpsertProductRequest("Gekapert", null, null, 0.01m, null, null, null, null, 0, null, 0), bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/products/{productB}/archive", bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/inventory/daily?locationId={b.LocationId}&date={b.PickupDate:yyyy-MM-dd}", bearer: ownerA))
            .AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(b.LocationId, b.PickupDate, [new DailyInventoryItemRequest(productB, 0, 0, true)]), bearer: ownerA))
            .AssertStatus(HttpStatusCode.NotFound);
        // Own location but a foreign product id: rejected, nothing created.
        (await _client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(a.LocationId, a.PickupDate, [new DailyInventoryItemRequest(productB, 5, 0, false)]), bearer: ownerA))
            .AssertStatus(HttpStatusCode.UnprocessableEntity);
        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/locations/{b.LocationId}", bearer: ownerA)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/reports/summary?locationId={b.LocationId}&from={b.PickupDate:yyyy-MM-dd}&to={b.PickupDate:yyyy-MM-dd}", bearer: ownerA))
            .AssertStatus(HttpStatusCode.OK); // owner passes location filter but sees only own tenant data:
        var summary = await (await _client.SendJsonAsync(HttpMethod.Get,
            $"/api/v1/admin/reports/summary?locationId={b.LocationId}&from={b.PickupDate:yyyy-MM-dd}&to={b.PickupDate:yyyy-MM-dd}", bearer: ownerA)).ReadAsync<ReportSummaryDto>();
        Assert.Equal(0, summary.Orders);

        var inv = await _data.GetInventoryAsync(b.Products[0].InventoryId);
        Assert.False(inv.IsUnavailable);
    }

    [Fact]
    public async Task Staff_assigned_to_one_location_cannot_access_another_location()
    {
        var bakery = await _data.CreateBakeryAsync();
        var (orderMain, orderMainId) = await PlaceOrderAsync(bakery);
        var otherStaff = await _client.LoginAsync(bakery.OtherLocationStaffEmail);

        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderMainId}", bearer: otherStaff)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/lookup?code={orderMain.Order.PublicReference}", bearer: otherStaff)).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderMainId}/collect", bearer: otherStaff)).AssertStatus(HttpStatusCode.NotFound);
        var filtered = await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders?locationId={bakery.LocationId}", bearer: otherStaff);
        filtered.AssertStatus(HttpStatusCode.Forbidden);
        var list = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/orders", bearer: otherStaff)).ReadAsync<PagedResult<OrderListItemDto>>();
        Assert.Empty(list.Items);
        var locations = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/locations", bearer: otherStaff)).ReadAsync<List<LocationDto>>();
        Assert.Equal([bakery.SecondLocationId], locations.Select(l => l.Id));

        var (_, orderSecondId) = await PlaceOrderAsync(bakery, bakery.SecondLocationId);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderSecondId}/collect", bearer: otherStaff)).AssertStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Staff_and_managers_cannot_perform_owner_operations()
    {
        var bakery = await _data.CreateBakeryAsync();
        var staff = await _client.LoginAsync(bakery.StaffEmail);
        var manager = await _client.LoginAsync(bakery.ManagerEmail);
        var product = new UpsertProductRequest("Neu", null, null, 1m, null, null, null, null, 0, null, 0);

        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/products", product, bearer: staff)).AssertStatus(HttpStatusCode.Forbidden);
        (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/staff", bearer: staff)).AssertStatus(HttpStatusCode.Forbidden);
        (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/reports/summary?from=2026-01-01&to=2026-01-31", bearer: staff)).AssertStatus(HttpStatusCode.Forbidden);
        (await _client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(bakery.LocationId, bakery.PickupDate, [new DailyInventoryItemRequest(bakery.Products[0].Id, 1, 0, false)]), bearer: staff))
            .AssertStatus(HttpStatusCode.Forbidden);

        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/products", product, bearer: manager)).AssertStatus(HttpStatusCode.Created);
        (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/staff", bearer: manager)).AssertStatus(HttpStatusCode.Forbidden);
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/subscription/change-plan", new ChangePlanRequest("multi"), bearer: manager)).AssertStatus(HttpStatusCode.Forbidden);
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/locations",
            new UpsertLocationRequest("X", "Y 1", "12345", "Z", null, null, null, true,
                new LocationSettingsDto("Europe/Berlin", true, 1, new TimeOnly(18, 0), 60, 14, 1, new TimeOnly(18, 0))), bearer: manager))
            .AssertStatus(HttpStatusCode.Forbidden);
        (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/platform/tenants", bearer: manager)).AssertStatus(HttpStatusCode.Forbidden);
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/platform/tenants", bearer: owner)).AssertStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Admin_endpoints_require_authentication()
    {
        (await _client.GetAsync("/api/v1/admin/orders")).AssertStatus(HttpStatusCode.Unauthorized);
        (await _client.GetAsync("/api/v1/admin/dashboard")).AssertStatus(HttpStatusCode.Unauthorized);
        var garbage = await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/orders", bearer: "eyJhbGciOiJIUzI1NiJ9.e30.invalid");
        garbage.AssertStatus(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Public_order_access_requires_the_capability_token()
    {
        var bakery = await _data.CreateBakeryAsync();
        var (order, _) = await PlaceOrderAsync(bakery);
        var reference = order.Order.PublicReference;

        (await _client.GetAsync($"/api/v1/public/orders/{reference}")).AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/public/orders/{reference}", headers: new Dictionary<string, string> { ["X-Order-Token"] = "wrong" }))
            .AssertStatus(HttpStatusCode.NotFound);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/public/orders/{reference}/cancel", headers: new Dictionary<string, string> { ["X-Order-Token"] = Guid.NewGuid().ToString() }))
            .AssertStatus(HttpStatusCode.NotFound);
        // Unknown reference and wrong token are indistinguishable.
        var unknown = await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/public/orders/BR-ZZZZZZ", headers: new Dictionary<string, string> { ["X-Order-Token"] = order.AccessToken });
        unknown.AssertStatus(HttpStatusCode.NotFound);
        Assert.Equal("order_not_found", await unknown.ErrorCodeAsync());

        var view = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/public/orders/{reference}",
            headers: new Dictionary<string, string> { ["X-Order-Token"] = order.AccessToken })).ReadAsync<PublicOrderDto>();
        Assert.Equal(reference, view.PublicReference);
        var json = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/public/orders/{reference}",
            headers: new Dictionary<string, string> { ["X-Order-Token"] = order.AccessToken })).Content.ReadAsStringAsync();
        Assert.DoesNotContain("erika@kunde.example", json); // email not echoed back on the public view
        Assert.DoesNotContain("accessTokenHash", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Public_catalog_never_exposes_unpublished_products_or_tenants()
    {
        var bakery = await _data.CreateBakeryAsync();
        var products = await (await _client.GetAsync($"/api/v1/public/bakeries/{bakery.Slug}/products?locationId={bakery.LocationId}&date={bakery.PickupDate:yyyy-MM-dd}"))
            .ReadAsync<PublicProductListDto>();
        Assert.DoesNotContain(products.Products, p => p.Id == bakery.DraftProductId);
        Assert.Equal(bakery.Products.Count, products.Products.Count);

        var draftOrder = bakery.OrderRequest() with { Items = [new CreateOrderItemRequest(bakery.DraftProductId, 1)] };
        var response = await _client.PostOrderAsync(draftOrder);
        response.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("product_unavailable", await response.ErrorCodeAsync());

        await _data.QueryAsync(async db =>
        {
            await db.Tenants.Where(t => t.Id == bakery.TenantId).ExecuteUpdateAsync(s => s.SetProperty(t => t.IsPublished, false));
            return 0;
        });
        (await _client.GetAsync($"/api/v1/public/bakeries/{bakery.Slug}")).AssertStatus(HttpStatusCode.NotFound);
        (await _client.GetAsync($"/api/v1/public/locations/{bakery.LocationId}/pickup-slots?date={bakery.PickupDate:yyyy-MM-dd}")).AssertStatus(HttpStatusCode.NotFound);
        (await _client.PostOrderAsync(bakery.OrderRequest((0, 1)))).AssertStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Suspended_tenant_is_hidden_publicly_and_read_only_for_staff()
    {
        var bakery = await _data.CreateBakeryAsync();
        await _data.QueryAsync(async db =>
        {
            await db.Tenants.Where(t => t.Id == bakery.TenantId).ExecuteUpdateAsync(s => s.SetProperty(t => t.Status, TenantStatus.Suspended));
            return 0;
        });
        (await _client.GetAsync($"/api/v1/public/bakeries/{bakery.Slug}")).AssertStatus(HttpStatusCode.NotFound);
        (await _client.PostOrderAsync(bakery.OrderRequest((0, 1)))).AssertStatus(HttpStatusCode.NotFound);

        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/products", bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var write = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/products",
            new UpsertProductRequest("X", null, null, 1m, null, null, null, null, 0, null, 0), bearer: owner);
        write.AssertStatus(HttpStatusCode.Forbidden);
        Assert.Equal("tenant_read_only", await write.ErrorCodeAsync());
    }

    [Fact]
    public async Task Client_cannot_set_prices_totals_or_tenant()
    {
        var bakery = await _data.CreateBakeryAsync();
        var other = await _data.CreateBakeryAsync();
        // Extra fields such as unitPrice/total/tenantId are ignored; the server uses catalogue prices.
        var json = $$"""
            {"locationId":"{{bakery.LocationId}}","tenantId":"{{other.TenantId}}","pickupDate":"{{bakery.PickupDate:yyyy-MM-dd}}","slotStart":"08:00",
             "items":[{"productId":"{{bakery.Products[0].Id}}","quantity":3,"unitPrice":0.01,"lineTotal":0.03}],
             "customer":{"firstName":"Max","email":"max@kunde.example"},"total":0.03,"subtotal":0.03,"acceptTerms":true}
            """;
        var response = await _client.PostAsync("/api/v1/public/orders", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        var order = await response.ReadAsync<CreateOrderResponse>();
        Assert.Equal(bakery.Products[0].Price * 3, order.Order.Total);
        Assert.Equal(bakery.Products[0].Price, order.Order.Items[0].UnitPrice);
        var tenantOfOrder = await _data.QueryAsync(db => db.Orders.Where(o => o.PublicReference == order.Order.PublicReference).Select(o => o.TenantId).SingleAsync());
        Assert.Equal(bakery.TenantId, tenantOfOrder);
    }

    [Fact]
    public async Task Customer_cannot_reserve_more_than_available_or_foreign_products()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 5);
        var other = await _data.CreateBakeryAsync();

        var tooMany = await _client.PostOrderAsync(bakery.OrderRequest((0, 6)));
        tooMany.AssertStatus(HttpStatusCode.Conflict);
        Assert.Equal("insufficient_stock", await tooMany.ErrorCodeAsync());

        var foreign = bakery.OrderRequest() with { Items = [new CreateOrderItemRequest(other.Products[0].Id, 1)] };
        var foreignResponse = await _client.PostOrderAsync(foreign);
        foreignResponse.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("product_unavailable", await foreignResponse.ErrorCodeAsync());

        var zero = await _client.PostOrderAsync(bakery.OrderRequest((0, 0)));
        zero.AssertStatus(HttpStatusCode.BadRequest);
        var negative = await _client.PostOrderAsync(bakery.OrderRequest((0, -3)));
        negative.AssertStatus(HttpStatusCode.BadRequest);
        var noTerms = await _client.PostOrderAsync(bakery.OrderRequest((0, 1)) with { AcceptTerms = false });
        noTerms.AssertStatus(HttpStatusCode.BadRequest);

        Assert.Equal(0, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
    }

    [Fact]
    public async Task Expired_and_already_used_invitations_are_rejected()
    {
        var bakery = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        var email = $"neu-{Guid.NewGuid():N}@test.example";
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/staff/invite",
            new InviteStaffRequest(email, MembershipRole.Staff, [bakery.LocationId], null), bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var token = await InvitationTokenAsync(email);

        // Response of the invite endpoint never contains the token.
        var accept = new AcceptInvitationRequest(token, "Neue", "Kollegin", "Sicheres-Passwort-1");
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/invitations/accept", accept,
            headers: new Dictionary<string, string> { ["X-Client-Type"] = "mobile" })).AssertStatus(HttpStatusCode.OK);
        var reuse = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/invitations/accept", accept,
            headers: new Dictionary<string, string> { ["X-Client-Type"] = "mobile" });
        reuse.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("invitation_invalid", await reuse.ErrorCodeAsync());

        var email2 = $"spaet-{Guid.NewGuid():N}@test.example";
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/staff/invite",
            new InviteStaffRequest(email2, MembershipRole.Staff, [bakery.LocationId], null), bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var token2 = await InvitationTokenAsync(email2);
        await _data.QueryAsync(async db =>
        {
            await db.Invitations.Where(i => i.Email == email2).ExecuteUpdateAsync(s => s.SetProperty(i => i.ExpiresAt, DateTimeOffset.UtcNow.AddDays(-30)));
            return 0;
        });
        var expired = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/invitations/accept",
            new AcceptInvitationRequest(token2, "Zu", "Spät", "Sicheres-Passwort-1"), headers: new Dictionary<string, string> { ["X-Client-Type"] = "mobile" });
        expired.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("invitation_invalid", await expired.ErrorCodeAsync());
    }

    [Fact]
    public async Task Refresh_tokens_rotate_and_reuse_revokes_the_session()
    {
        var bakery = await _data.CreateBakeryAsync();
        var mobile = new Dictionary<string, string> { ["X-Client-Type"] = "mobile" };
        var login = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(bakery.OwnerEmail, TestBakery.Password), headers: mobile))
            .ReadAsync<AuthResponse>();
        var first = login.RefreshToken!;
        var rotated = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/refresh", new RefreshRequest(first), headers: mobile)).ReadAsync<AuthResponse>();
        Assert.NotEqual(first, rotated.RefreshToken);

        // Replaying the old token is treated as theft: it fails and the newer token is revoked too.
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/refresh", new RefreshRequest(first), headers: mobile)).AssertStatus(HttpStatusCode.Unauthorized);
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/refresh", new RefreshRequest(rotated.RefreshToken), headers: mobile)).AssertStatus(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Browser_refresh_requires_cookie_and_anti_csrf_header()
    {
        var response = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/refresh", new RefreshRequest(null));
        response.AssertStatus(HttpStatusCode.Forbidden);
        Assert.Equal("csrf_header_missing", await response.ErrorCodeAsync());

        var bakery = await _data.CreateBakeryAsync();
        var login = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(bakery.OwnerEmail, TestBakery.Password));
        var body = await login.ReadAsync<AuthResponse>();
        Assert.Null(body.RefreshToken); // browser clients never see the refresh token
        var cookie = login.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("br_refresh="));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/v1/auth", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Login_does_not_reveal_whether_an_account_exists_and_locks_out()
    {
        var bakery = await _data.CreateBakeryAsync();
        var unknown = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest("niemand@test.example", "Falsch-12345"));
        var wrong = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(bakery.StaffEmail, "Falsch-12345"));
        unknown.AssertStatus(HttpStatusCode.Unauthorized);
        wrong.AssertStatus(HttpStatusCode.Unauthorized);
        Assert.Equal(await unknown.ErrorCodeAsync(), await wrong.ErrorCodeAsync());

        for (var i = 0; i < 5; i++) await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(bakery.StaffEmail, "Falsch-12345"));
        var locked = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(bakery.StaffEmail, TestBakery.Password));
        locked.AssertStatus(HttpStatusCode.Unauthorized);
        Assert.Equal("locked_out", await locked.ErrorCodeAsync());
    }

    [Fact]
    public async Task Uploads_accept_only_real_images()
    {
        var bakery = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);

        async Task<HttpResponseMessage> Upload(byte[] bytes, string fileName, string contentType)
        {
            var content = new MultipartFormDataContent();
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
            content.Add(file, "file", fileName);
            using var msg = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/uploads/images") { Content = content };
            msg.Headers.Authorization = new("Bearer", owner);
            return await _client.SendAsync(msg);
        }

        var svg = await Upload("<svg onload=alert(1)>"u8.ToArray(), "x.png", "image/png");
        svg.AssertStatus(HttpStatusCode.UnprocessableEntity);
        var html = await Upload("<html><script>alert(1)</script>"u8.ToArray(), "../../evil.jpg", "image/jpeg");
        html.AssertStatus(HttpStatusCode.UnprocessableEntity);

        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52];
        var ok = await Upload(png, "../../../../windows/foto.exe", "application/octet-stream");
        var result = await ok.Content.ReadFromJsonAsync<UploadResultDto>(Json.Options);
        ok.AssertStatus(HttpStatusCode.OK);
        Assert.Matches("^/media/uploads/[0-9a-f]{32}\\.png$", result!.Url);
        Assert.Single(Directory.GetFiles(factory.UploadPath));

        var staff = await _client.LoginAsync(bakery.StaffEmail);
        using var staffMsg = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/uploads/images");
        var staffContent = new MultipartFormDataContent { { new ByteArrayContent(png), "file", "a.png" } };
        staffMsg.Content = staffContent;
        staffMsg.Headers.Authorization = new("Bearer", staff);
        (await _client.SendAsync(staffMsg)).AssertStatus(HttpStatusCode.Forbidden);
    }

    private sealed record UploadResultDto(string Url);

    private async Task<string> InvitationTokenAsync(string email)
    {
        await factory.FlushOutboxAsync();
        var mail = factory.Mailbox.All().First(m => m.To == email && m.Category == "staff_invitation");
        var marker = "einladung#t=";
        var start = mail.TextBody.IndexOf(marker, StringComparison.Ordinal) + marker.Length;
        return new string(mail.TextBody[start..].TakeWhile(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
    }
}
