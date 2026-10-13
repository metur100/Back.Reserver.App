using System.Net;
using System.Text;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Inventory;
using BackReserve.Domain.Enums;
using BackReserve.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BackReserve.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class FlowTests(ApiFactory factory)
{
    private readonly TestDataBuilder _data = new(factory);
    private readonly HttpClient _client = factory.CreateApiClient();
    private static readonly Dictionary<string, string> Mobile = new() { ["X-Client-Type"] = "mobile" };

    private static string LinkFragmentValue(string text, string key)
    {
        var start = text.IndexOf(key + "=", StringComparison.Ordinal) + key.Length + 1;
        var value = new string(text[start..].TakeWhile(c => !char.IsWhiteSpace(c) && c != '&').ToArray());
        return Uri.UnescapeDataString(value);
    }

    [Fact]
    public async Task Bakery_onboarding_to_collected_order()
    {
        var email = $"gruender-{Guid.NewGuid():N}@test.example";
        var register = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/register-bakery",
            new RegisterBakeryRequest("Greta", "Gründer", email, "Sicheres-Passwort-1", "Konditorei Testfeld", null, true));
        register.AssertStatus(HttpStatusCode.Accepted);
        var genericMessage = (await register.ReadAsync<MessageResponse>()).Message;

        // Unconfirmed accounts cannot log in.
        var early = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(email, "Sicheres-Passwort-1"));
        Assert.Equal("email_not_confirmed", await early.ErrorCodeAsync());

        await factory.FlushOutboxAsync();
        var mail = factory.Mailbox.All().First(m => m.To == email && m.Category == "confirm_email");
        var uid = Guid.Parse(LinkFragmentValue(mail.TextBody, "uid"));
        var token = LinkFragmentValue(mail.TextBody, "token");
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/confirm-email", new ConfirmEmailRequest(uid, token))).AssertStatus(HttpStatusCode.OK);

        var auth = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/login", new LoginRequest(email, "Sicheres-Passwort-1"), headers: Mobile))
            .ReadAsync<AuthResponse>();
        var membership = Assert.Single(auth.User.Memberships);
        Assert.Equal(MembershipRole.Owner, membership.Role);
        Assert.Equal("konditorei-testfeld", membership.TenantSlug);
        var owner = auth.AccessToken;

        // Registering the same email again yields the same generic answer (no account enumeration).
        var again = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/register-bakery",
            new RegisterBakeryRequest("X", "Y", email, "Anderes-Passwort-2", "Andere Bäckerei", null, true));
        again.AssertStatus(HttpStatusCode.Accepted);
        Assert.Equal(genericMessage, (await again.ReadAsync<MessageResponse>()).Message);
        Assert.Equal(1, await _data.QueryAsync(db => db.TenantMemberships.CountAsync(m => m.User.Email == email)));

        // Location, schedule (all days open, same-day ordering), category, product, publish.
        var location = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/locations",
            new UpsertLocationRequest("Testfeld Mitte", "Feldweg 1", "50667", "Köln", "DE", null, null, true,
                new LocationSettingsDto("Europe/Berlin", true, 0, new TimeOnly(23, 59), 0, 14, 1, new TimeOnly(18, 0))), bearer: owner))
            .ReadAsync<LocationDto>();
        Assert.Equal(7, location.Schedule.Count);
        var rules = location.Schedule.Select(r => r with { IsOpen = true, PickupStart = new TimeOnly(7, 0), PickupEnd = new TimeOnly(11, 0), MaxOrdersPerSlot = 5 }).ToList();
        (await _client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/pickup-schedules", new UpdateScheduleRequest(location.Id, rules), bearer: owner))
            .AssertStatus(HttpStatusCode.OK);

        var category = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/categories", new UpsertCategoryRequest("Donuts", 1), bearer: owner))
            .ReadAsync<CategoryDto>();
        var product = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/products",
            new UpsertProductRequest("Himbeer-Donut", "Mit Himbeerfüllung", category.Id, 2.40m, null, "Weizen, Ei, Milch", null, ["vegetarisch"], 0, 30, 1), bearer: owner))
            .ReadAsync<ProductDto>();
        Assert.False(product.IsPublished);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/products/{product.Id}/publish", bearer: owner)).AssertStatus(HttpStatusCode.OK);

        var date = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(factory.Clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin")).DateTime).AddDays(2);
        (await _client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(location.Id, date, [new DailyInventoryItemRequest(product.Id, 30, 2, false)]), bearer: owner)).AssertStatus(HttpStatusCode.OK);

        // Not public until the bakery publishes its page.
        (await _client.GetAsync("/api/v1/public/bakeries/konditorei-testfeld")).AssertStatus(HttpStatusCode.NotFound);
        var settings = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/settings", bearer: owner)).ReadAsync<TenantSettingsDto>();
        (await _client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/settings", new UpdateTenantSettingsRequest(
            settings.Name, "Beste Donuts", null, null, null, null, null, null, true, false, false, true, false, 12,
            "Bitte an der Theke melden.", settings.CancellationPolicyText, settings.AllergenDisclaimer, 365), bearer: owner)).AssertStatus(HttpStatusCode.OK);

        // Customer journey.
        var bakery = await (await _client.GetAsync("/api/v1/public/bakeries/konditorei-testfeld")).ReadAsync<PublicBakeryDto>();
        Assert.Equal("Testfeld Mitte", Assert.Single(bakery.Locations).Name);
        var dates = await (await _client.GetAsync($"/api/v1/public/bakeries/konditorei-testfeld/availability?locationId={location.Id}")).ReadAsync<List<PublicAvailableDateDto>>();
        Assert.Contains(dates, d => d.Date == date && d.IsOrderable);
        var products = await (await _client.GetAsync($"/api/v1/public/bakeries/konditorei-testfeld/products?locationId={location.Id}&date={date:yyyy-MM-dd}"))
            .ReadAsync<PublicProductListDto>();
        var publicProduct = Assert.Single(products.Products);
        Assert.Equal(28, publicProduct.Remaining); // 30 planned - 2 buffer
        var slots = await (await _client.GetAsync($"/api/v1/public/locations/{location.Id}/pickup-slots?date={date:yyyy-MM-dd}&productIds={product.Id}"))
            .ReadAsync<PickupSlotListDto>();
        Assert.Equal(8, slots.Slots.Count);

        var created = await (await _client.PostOrderAsync(new CreateOrderRequest(location.Id, date, new TimeOnly(7, 30),
            [new CreateOrderItemRequest(product.Id, 12)], new CustomerDetailsRequest("Kai", null, "kai@kunde.example", null), "Ohne Tüte", true),
            Guid.NewGuid().ToString())).ReadAsync<CreateOrderResponse>();
        Assert.Equal(OrderStatus.Confirmed, created.Order.Status);
        Assert.Equal(28.80m, created.Order.Total);
        Assert.Equal(PaymentMode.PayAtPickup, created.Order.PaymentMode);
        Assert.Matches("^BR-[23456789A-HJKMNP-Z]{6}$", created.Order.PublicReference);

        // Confirmation email via outbox, with the capability token only in the URL fragment.
        await factory.FlushOutboxAsync();
        var confirmation = factory.Mailbox.All().First(m => m.To == "kai@kunde.example" && m.Category == "order_confirmed" && m.Subject.Contains(created.Order.PublicReference));
        Assert.Contains($"/bestellung/{created.Order.PublicReference}#t={created.AccessToken}", confirmation.TextBody);
        Assert.Contains("Bezahlung bei Abholung", confirmation.TextBody);

        // Bakery processes and hands over the order.
        var list = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders?dateFrom={date:yyyy-MM-dd}&dateTo={date:yyyy-MM-dd}", bearer: owner))
            .ReadAsync<PagedResult<OrderListItemDto>>();
        var listed = Assert.Single(list.Items);
        Assert.True(listed.HasNote);
        var detail = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/{listed.Id}", bearer: owner)).ReadAsync<OrderDetailDto>();
        Assert.Equal("kai@kunde.example", detail.CustomerEmail); // owner may see contact data
        Assert.Contains("collect", detail.AllowedActions);
        Assert.DoesNotContain("no-show", detail.AllowedActions); // pickup window not over yet

        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{listed.Id}/prepare", bearer: owner)).AssertStatus(HttpStatusCode.OK);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{listed.Id}/ready", bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var production = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/inventory?locationId={location.Id}&date={date:yyyy-MM-dd}", bearer: owner))
            .ReadAsync<ProductionOverviewDto>();
        var row = Assert.Single(production.Products);
        Assert.Equal((30, 12, 16), (row.PlannedQuantity, row.ReservedQuantity, row.Remaining));
        Assert.Equal(12, Assert.Single(row.BySlot).Quantity);

        var collected = await (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{listed.Id}/collect", bearer: owner)).ReadAsync<OrderDetailDto>();
        Assert.Equal(OrderStatus.Collected, collected.Status);
        Assert.Equal([OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.ReadyForPickup, OrderStatus.Collected], collected.History.Select(h => h.ToStatus));

        // The customer sees the final status; collected orders can no longer be cancelled.
        var view = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/public/orders/{created.Order.PublicReference}",
            headers: new Dictionary<string, string> { ["X-Order-Token"] = created.AccessToken })).ReadAsync<PublicOrderDto>();
        Assert.Equal(OrderStatus.Collected, view.Status);
        Assert.False(view.CanCancel);

        // Ready notification was queued because the bakery enabled it.
        await factory.FlushOutboxAsync();
        Assert.Contains(factory.Mailbox.All(), m => m.To == "kai@kunde.example" && m.Category == "order_ready");

        // Historical orders keep snapshotted prices even after a price change.
        (await _client.SendJsonAsync(HttpMethod.Put, $"/api/v1/admin/products/{product.Id}",
            new UpsertProductRequest("Himbeer-Donut XL", null, category.Id, 3.10m, null, null, null, null, 0, 30, 1), bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var historical = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/{listed.Id}", bearer: owner)).ReadAsync<OrderDetailDto>();
        Assert.Equal(2.40m, historical.Items[0].UnitPrice);
        Assert.Equal("Himbeer-Donut", historical.Items[0].ProductName);
        Assert.Equal(28.80m, historical.Total);
    }

    [Fact]
    public async Task Customer_cancellation_restores_stock_and_respects_the_deadline()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var order = await (await _client.PostOrderAsync(bakery.OrderRequest((0, 4), (1, 2)))).ReadAsync<CreateOrderResponse>();
        var headers = new Dictionary<string, string> { ["X-Order-Token"] = order.AccessToken };
        Assert.True(order.Order.CanCancel);

        var cancelled = await (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/public/orders/{order.Order.PublicReference}/cancel", headers: headers))
            .ReadAsync<PublicOrderDto>();
        Assert.Equal(OrderStatus.Cancelled, cancelled.Status);
        Assert.Equal(0, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
        Assert.Equal(0, (await _data.GetInventoryAsync(bakery.Products[1].InventoryId)).ReservedQuantity);
        await factory.FlushOutboxAsync();
        Assert.Contains(factory.Mailbox.All(), m => m.Category == "order_cancelled" && m.Subject.Contains(order.Order.PublicReference));
        Assert.True(await _data.QueryAsync(db => db.Notifications.AnyAsync(n => n.TenantId == bakery.TenantId && n.Type == NotificationType.OrderCancelledByCustomer)));

        // A second order placed now cannot be cancelled after the cutoff (18:00 the day before pickup).
        var late = await (await _client.PostOrderAsync(bakery.OrderRequest((0, 1)))).ReadAsync<CreateOrderResponse>();
        var deadline = late.Order.CancellationDeadline;
        factory.Clock.SetUtcNow(deadline.AddMinutes(1));
        var refused = await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/public/orders/{late.Order.PublicReference}/cancel",
            headers: new Dictionary<string, string> { ["X-Order-Token"] = late.AccessToken });
        refused.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("cancellation_window_closed", await refused.ErrorCodeAsync());
        Assert.Equal(1, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
    }

    [Fact]
    public async Task Pickup_rules_reject_closed_dates_unknown_slots_and_past_dates()
    {
        var bakery = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);

        var badSlot = await _client.PostOrderAsync(bakery.OrderRequest((0, 1)) with { SlotStart = new TimeOnly(7, 15) });
        Assert.Equal("invalid_slot", await badSlot.ErrorCodeAsync());
        var past = await _client.PostOrderAsync(bakery.OrderRequest((0, 1)) with { PickupDate = bakery.PickupDate.AddDays(-30) });
        Assert.Equal("pickup_date_unavailable", await past.ErrorCodeAsync());
        var tooFar = await _client.PostOrderAsync(bakery.OrderRequest((0, 1)) with { PickupDate = bakery.PickupDate.AddDays(60) });
        Assert.Equal("pickup_date_unavailable", await tooFar.ErrorCodeAsync());

        // A closure cannot be added while reservations exist for that day...
        (await _client.PostOrderAsync(bakery.OrderRequest((0, 1)))).AssertStatus(HttpStatusCode.Created);
        var closure = await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/locations/{bakery.LocationId}/closures",
            new AddClosureRequest(bakery.PickupDate, "Betriebsferien"), bearer: owner);
        closure.AssertStatus(HttpStatusCode.Conflict);
        Assert.Equal("closure_has_orders", await closure.ErrorCodeAsync());

        // ...but on a free day it blocks new reservations.
        var freeDay = bakery.PickupDate.AddDays(1);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/locations/{bakery.LocationId}/closures",
            new AddClosureRequest(freeDay, "Betriebsferien"), bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var closed = await _client.PostOrderAsync(bakery.OrderRequest((0, 1)) with { PickupDate = freeDay });
        Assert.Equal("pickup_date_unavailable", await closed.ErrorCodeAsync());
        var slots = await (await _client.GetAsync($"/api/v1/public/locations/{bakery.LocationId}/pickup-slots?date={freeDay:yyyy-MM-dd}")).ReadAsync<PickupSlotListDto>();
        Assert.False(slots.DateIsOrderable);
        Assert.Equal("closed", slots.DateStatus);
    }

    [Fact]
    public async Task Product_lead_time_blocks_slots_that_are_too_soon()
    {
        var bakery = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        var product = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/products/{bakery.Products[0].Id}", bearer: owner)).ReadAsync<ProductDto>();
        (await _client.SendJsonAsync(HttpMethod.Put, $"/api/v1/admin/products/{product.Id}",
            new UpsertProductRequest(product.Name, null, null, product.BasePrice, null, null, null, null, 24 * 10, null, 0), bearer: owner)).AssertStatus(HttpStatusCode.OK);

        var response = await _client.PostOrderAsync(bakery.OrderRequest((0, 1)));
        response.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("slot_too_soon", await response.ErrorCodeAsync());
        var slots = await (await _client.GetAsync($"/api/v1/public/locations/{bakery.LocationId}/pickup-slots?date={bakery.PickupDate:yyyy-MM-dd}&productIds={product.Id}"))
            .ReadAsync<PickupSlotListDto>();
        Assert.All(slots.Slots, s => Assert.Equal("too_soon", s.UnavailableReason));
    }

    [Fact]
    public async Task No_show_only_after_pickup_window_and_keeps_stock_committed()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var order = await (await _client.PostOrderAsync(bakery.OrderRequest((0, 3)))).ReadAsync<CreateOrderResponse>();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        var id = await _data.QueryAsync(db => db.Orders.Where(o => o.PublicReference == order.Order.PublicReference).Select(o => o.Id).SingleAsync());

        var early = await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/no-show", bearer: owner);
        early.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("no_show_too_early", await early.ErrorCodeAsync());

        var pickupEnd = await _data.QueryAsync(db => db.Orders.Where(o => o.Id == id).Select(o => o.PickupEndUtc).SingleAsync());
        if (factory.Clock.GetUtcNow() < pickupEnd) factory.Clock.SetUtcNow(pickupEnd.AddMinutes(5));
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/no-show", bearer: owner)).AssertStatus(HttpStatusCode.OK);
        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        Assert.Equal((0, 3), (inv.ReservedQuantity, inv.NoShowQuantity));
    }

    [Fact]
    public async Task Bakery_cancellation_requires_reason_and_notifies_customer()
    {
        var bakery = await _data.CreateBakeryAsync();
        var order = await (await _client.PostOrderAsync(bakery.OrderRequest((0, 2)))).ReadAsync<CreateOrderResponse>();
        var manager = await _client.LoginAsync(bakery.ManagerEmail);
        var id = await _data.QueryAsync(db => db.Orders.Where(o => o.PublicReference == order.Order.PublicReference).Select(o => o.Id).SingleAsync());

        var noReason = await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/cancel", new OrderActionRequest(null), bearer: manager);
        Assert.Equal("reason_required", await noReason.ErrorCodeAsync());
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/cancel", new OrderActionRequest("Ofen defekt"), bearer: manager)).AssertStatus(HttpStatusCode.OK);

        await factory.FlushOutboxAsync();
        var mail = factory.Mailbox.All().First(m => m.Category == "order_cancelled" && m.Subject.Contains(order.Order.PublicReference));
        Assert.Contains("Ofen defekt", mail.TextBody);
        Assert.True(await _data.QueryAsync(db => db.AuditLogs.AnyAsync(a => a.TenantId == bakery.TenantId && a.Action == "order.cancelled")));
        Assert.Equal(0, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
    }

    [Fact]
    public async Task Staff_can_report_a_pickup_problem_without_changing_status()
    {
        var bakery = await _data.CreateBakeryAsync();
        var order = await (await _client.PostOrderAsync(bakery.OrderRequest((0, 1)))).ReadAsync<CreateOrderResponse>();
        var staff = await _client.LoginAsync(bakery.StaffEmail);
        var id = await _data.QueryAsync(db => db.Orders.Where(o => o.PublicReference == order.Order.PublicReference).Select(o => o.Id).SingleAsync());

        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/problem", new ReportProblemRequest(""), bearer: staff))
            .AssertStatus(HttpStatusCode.BadRequest);
        var detail = await (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/problem",
            new ReportProblemRequest("Kunde sagt, ein Croissant fehlt."), bearer: staff)).ReadAsync<OrderDetailDto>();

        Assert.Equal(OrderStatus.Confirmed, detail.Status);
        Assert.Contains(detail.History, h => h.Note == "Abholproblem: Kunde sagt, ein Croissant fehlt." && h.ChangedByName != null);
        Assert.True(await _data.QueryAsync(db => db.Notifications.AnyAsync(n => n.OrderId == id && n.Type == NotificationType.PickupProblem)));
        var other = await _data.CreateBakeryAsync();
        var otherOwner = await _client.LoginAsync(other.OwnerEmail);
        (await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/problem", new ReportProblemRequest("x"), bearer: otherOwner))
            .AssertStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Staff_invitation_flow_creates_location_scoped_account()
    {
        var bakery = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        var email = $"aushilfe-{Guid.NewGuid():N}@test.example";
        var invite = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/staff/invite",
            new InviteStaffRequest(email, MembershipRole.Staff, [bakery.SecondLocationId], null), bearer: owner);
        var invitation = await invite.ReadAsync<InvitationDto>();
        Assert.DoesNotContain("token", await invite.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("pending", invitation.Status);

        await factory.FlushOutboxAsync();
        var mail = factory.Mailbox.All().First(m => m.To == email && m.Category == "staff_invitation");
        var token = LinkFragmentValue(mail.TextBody, "#t");
        var info = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/invitations/inspect", new { token })).ReadAsync<InvitationInfoDto>();
        Assert.False(info.AccountExists);

        var auth = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/invitations/accept",
            new AcceptInvitationRequest(token, "Ali", "Aushilfe", "Sicheres-Passwort-1"), headers: Mobile)).ReadAsync<AuthResponse>();
        var m = Assert.Single(auth.User.Memberships);
        Assert.Equal(MembershipRole.Staff, m.Role);
        Assert.Equal([bakery.SecondLocationId], m.LocationIds);
        Assert.DoesNotContain("ProductsManage", m.Permissions);

        var staffOverview = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/staff", bearer: owner)).ReadAsync<StaffOverviewDto>();
        Assert.Contains(staffOverview.Members, x => x.Email == email);
        Assert.DoesNotContain(staffOverview.Invitations, i => i.Id == invitation.Id);
    }

    [Fact]
    public async Task Password_reset_flow_and_generic_forgot_response()
    {
        var bakery = await _data.CreateBakeryAsync();
        var unknown = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/forgot-password", new ForgotPasswordRequest("gibtsnicht@test.example")))
            .ReadAsync<MessageResponse>();
        var known = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/forgot-password", new ForgotPasswordRequest(bakery.StaffEmail)))
            .ReadAsync<MessageResponse>();
        Assert.Equal(unknown.Message, known.Message);

        await factory.FlushOutboxAsync();
        var mail = factory.Mailbox.All().First(m => m.To == bakery.StaffEmail && m.Category == "reset_password");
        var token = LinkFragmentValue(mail.TextBody, "token");
        (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/reset-password",
            new ResetPasswordRequest(bakery.StaffEmail, token, "Ganz-Neues-Passwort-9"))).AssertStatus(HttpStatusCode.OK);
        await _client.LoginAsync(bakery.StaffEmail, "Ganz-Neues-Passwort-9");
        var reuse = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/auth/reset-password",
            new ResetPasswordRequest(bakery.StaffEmail, token, "Noch-Ein-Passwort-7"));
        Assert.Equal("invalid_token", await reuse.ErrorCodeAsync());
    }

    [Fact]
    public async Task Copy_day_and_apply_defaults_never_reduce_below_reservations()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 20);
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        var target = bakery.PickupDate.AddDays(1);

        var copy = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/inventory/copy-day",
            new CopyDayRequest(bakery.LocationId, bakery.PickupDate, target, false), bearer: owner)).ReadAsync<CopyDayResult>();
        Assert.Equal(3, copy.Created); // both published products and the draft (drafts can be planned ahead)

        (await _client.PostOrderAsync(bakery.OrderRequest((0, 15)) with { PickupDate = target })).AssertStatus(HttpStatusCode.Created);
        // Defaults (10 per product) would undercut the 15 reserved units of product 1: that row is left untouched with a warning.
        var defaults = await (await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/inventory/apply-defaults",
            new ApplyDefaultsRequest(bakery.LocationId, target, true), bearer: owner)).ReadAsync<CopyDayResult>();
        Assert.Equal(1, defaults.Updated);
        Assert.Single(defaults.Warnings);
        var daily = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/inventory/daily?locationId={bakery.LocationId}&date={target:yyyy-MM-dd}", bearer: owner))
            .ReadAsync<DailyInventoryDto>();
        Assert.Equal(20, daily.Rows.Single(r => r.ProductId == bakery.Products[0].Id).PlannedQuantity);
        Assert.Equal(10, daily.Rows.Single(r => r.ProductId == bakery.Products[1].Id).PlannedQuantity);
    }

    [Fact]
    public async Task Reports_are_tenant_scoped_and_csv_is_injection_safe()
    {
        var bakery = await _data.CreateBakeryAsync();
        var other = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        await _data.QueryAsync(async db =>
        {
            await db.Products.Where(p => p.Id == bakery.Products[0].Id).ExecuteUpdateAsync(s => s.SetProperty(p => p.Name, "=HYPERLINK(\"http://evil\")"));
            return 0;
        });
        (await _client.PostOrderAsync(bakery.OrderRequest((0, 2)))).AssertStatus(HttpStatusCode.Created);
        (await _client.PostOrderAsync(other.OrderRequest((0, 5)))).AssertStatus(HttpStatusCode.Created);
        var cancelled = await (await _client.PostOrderAsync(bakery.OrderRequest((1, 1)))).ReadAsync<CreateOrderResponse>();
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/v1/public/orders/{cancelled.Order.PublicReference}/cancel",
            headers: new Dictionary<string, string> { ["X-Order-Token"] = cancelled.AccessToken });

        var range = $"from={bakery.PickupDate:yyyy-MM-dd}&to={bakery.PickupDate:yyyy-MM-dd}";
        var summary = await (await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/reports/summary?{range}", bearer: owner)).ReadAsync<ReportSummaryDto>();
        Assert.Equal((1, 2, 1), (summary.Orders, summary.Items, summary.Cancelled));
        Assert.Equal(bakery.Products[0].Price * 2, summary.ReservedValue);

        var csv = await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/reports/products/export?{range}", bearer: owner);
        csv.AssertStatus(HttpStatusCode.OK);
        Assert.Equal("text/csv", csv.Content.Headers.ContentType!.MediaType);
        var text = Encoding.UTF8.GetString(await csv.Content.ReadAsByteArrayAsync());
        Assert.Contains("\"'=HYPERLINK(\"\"http://evil\"\")\"", text);
        Assert.DoesNotContain(other.Products[0].Name + ";5", text);

        var starter = await _data.CreateBakeryAsync(planCode: "starter");
        var starterOwner = await _client.LoginAsync(starter.OwnerEmail);
        var blocked = await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/reports/products/export?{range}", bearer: starterOwner);
        blocked.AssertStatus(HttpStatusCode.Forbidden);
        Assert.Equal("plan_feature_unavailable", await blocked.ErrorCodeAsync());
    }

    [Fact]
    public async Task Plan_limits_are_enforced_on_the_backend()
    {
        var bakery = await _data.CreateBakeryAsync(planCode: "starter"); // starter: 1 location, test bakery already has 2
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        var create = await _client.SendJsonAsync(HttpMethod.Post, "/api/v1/admin/locations",
            new UpsertLocationRequest("Dritte", "Weg 3", "12345", "Ort", null, null, null, true,
                new LocationSettingsDto("Europe/Berlin", true, 1, new TimeOnly(18, 0), 60, 14, 1, new TimeOnly(18, 0))), bearer: owner);
        create.AssertStatus(HttpStatusCode.Forbidden);
        Assert.Equal("plan_limit_locations", await create.ErrorCodeAsync());
        var production = await _client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/inventory?locationId={bakery.LocationId}&date={bakery.PickupDate:yyyy-MM-dd}", bearer: owner);
        Assert.Equal("plan_feature_unavailable", await production.ErrorCodeAsync());

        var subscription = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/subscription", bearer: owner)).ReadAsync<SubscriptionDto>();
        Assert.Equal("starter", subscription.Plan.Code);
        Assert.False(subscription.BillingConfigured);
    }

    [Fact]
    public async Task Dashboard_reflects_real_reservations()
    {
        var bakery = await _data.CreateBakeryAsync();
        var owner = await _client.LoginAsync(bakery.OwnerEmail);
        (await _client.PostOrderAsync(bakery.OrderRequest((0, 2)))).AssertStatus(HttpStatusCode.Created);
        var dashboard = await (await _client.SendJsonAsync(HttpMethod.Get, "/api/v1/admin/dashboard", bearer: owner)).ReadAsync<DashboardDto>();
        Assert.Single(dashboard.RecentOrders);
        Assert.True(dashboard.UnreadNotifications >= 1);
        Assert.Equal(0, dashboard.ReservationsToday); // the order is for a later date
    }

    [Fact]
    public async Task Validation_errors_are_german_problem_details()
    {
        var bakery = await _data.CreateBakeryAsync();
        var request = bakery.OrderRequest((0, 1)) with { Customer = new CustomerDetailsRequest("", null, "keine-mail", "abc"), Note = new string('x', 600) };
        var response = await _client.PostOrderAsync(request);
        response.AssertStatus(HttpStatusCode.BadRequest);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Bitte gib deinen Vornamen an.", body);
        Assert.Contains("gültige E-Mail-Adresse", body);
        Assert.Contains("\"customer.firstName\"", body);
        Assert.Contains("validation_failed", body);
    }

    [Fact]
    public async Task Malformed_requests_use_the_same_problem_contract()
    {
        var response = await _client.PostAsync("/api/v1/public/orders",
            new StringContent("""{"locationId":"not-a-guid","pickupDate":"morgen","items":"x"}""", Encoding.UTF8, "application/json"));
        response.AssertStatus(HttpStatusCode.BadRequest);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("validation_failed", await response.ErrorCodeAsync());
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Die Anfrage ist ungültig", body);
        Assert.DoesNotContain("One or more validation errors", body);
    }

    [Fact]
    public async Task Maintenance_jobs_are_idempotent_and_reconciliation_finds_no_drift()
    {
        var bakery = await _data.CreateBakeryAsync();
        (await _client.PostOrderAsync(bakery.OrderRequest((0, 2)))).AssertStatus(HttpStatusCode.Created);
        using var scope = factory.Services.CreateScope();
        var jobs = scope.ServiceProvider.GetRequiredService<BackReserve.Infrastructure.Jobs.MaintenanceJobs>();
        Assert.Equal(0, await jobs.ReconcileInventoryAsync(CancellationToken.None));
        await jobs.CleanupAsync(CancellationToken.None);
        await jobs.CleanupAsync(CancellationToken.None);
        await jobs.AnonymizeExpiredCustomerDataAsync(CancellationToken.None);
        Assert.Equal(0, await jobs.AnonymizeExpiredCustomerDataAsync(CancellationToken.None));
    }
}
