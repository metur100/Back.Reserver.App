using System.Net;
using BackReserve.Application.Contracts;
using BackReserve.Domain.Enums;
using BackReserve.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.IntegrationTests;

/// <summary>
/// Concurrency guarantees, verified against real SQL Server. Requests are released simultaneously through a gate so they
/// genuinely race inside the database.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ConcurrencyTests(ApiFactory factory)
{
    private readonly TestDataBuilder _data = new(factory);

    private static async Task<HttpResponseMessage[]> RaceAsync(int count, Func<int, Task<HttpResponseMessage>> action)
    {
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tasks = Enumerable.Range(0, count).Select(async i =>
        {
            await gate.Task;
            return await action(i);
        }).ToArray();
        gate.SetResult();
        return await Task.WhenAll(tasks);
    }

    private static void AssertNoServerErrors(IEnumerable<HttpResponseMessage> responses) =>
        Assert.DoesNotContain(responses, r => (int)r.StatusCode >= 500);

    [Fact]
    public async Task Two_customers_racing_for_the_last_unit_only_one_wins()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 1);
        var client = factory.CreateApiClient();

        var responses = await RaceAsync(2, _ => client.PostOrderAsync(bakery.OrderRequest((0, 1))));

        AssertNoServerErrors(responses);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        var loser = Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal("insufficient_stock", await loser.ErrorCodeAsync());
        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        Assert.Equal(1, inv.ReservedQuantity);
    }

    [Fact]
    public async Task Many_concurrent_reservations_never_exceed_stock()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var client = factory.CreateApiClient();

        var responses = await RaceAsync(40, i => client.PostOrderAsync(bakery.OrderRequest((0, 1 + i % 3))));

        AssertNoServerErrors(responses);
        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        var reservedByOrders = await _data.QueryAsync(db => db.OrderItems.Where(i => i.DailyInventoryId == inv.Id).SumAsync(i => i.Quantity));
        Assert.True(inv.ReservedQuantity <= 10, $"Oversold: {inv.ReservedQuantity}");
        Assert.Equal(reservedByOrders, inv.ReservedQuantity);
        Assert.True(inv.ReservedQuantity >= 8, "Stock should be (nearly) sold out after 40 attempts");
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.Created), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
    }

    [Fact]
    public async Task Multi_product_orders_in_opposite_order_do_not_deadlock_or_oversell()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 15, productCount: 2);
        var client = factory.CreateApiClient();

        var responses = await RaceAsync(30, i => client.PostOrderAsync(i % 2 == 0 ? bakery.OrderRequest((0, 1), (1, 1)) : bakery.OrderRequest((1, 1), (0, 1))));

        AssertNoServerErrors(responses);
        Assert.Equal(15, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(15, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
        Assert.Equal(15, (await _data.GetInventoryAsync(bakery.Products[1].InventoryId)).ReservedQuantity);
    }

    [Fact]
    public async Task Pickup_slot_order_capacity_cannot_be_exceeded()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 100, maxOrdersPerSlot: 3);
        var client = factory.CreateApiClient();

        var responses = await RaceAsync(15, _ => client.PostOrderAsync(bakery.OrderRequest((0, 1))));

        AssertNoServerErrors(responses);
        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        foreach (var r in responses.Where(r => r.StatusCode != HttpStatusCode.Created))
            Assert.Equal("slot_full", await r.ErrorCodeAsync());
        var counter = await _data.QueryAsync(db => db.PickupSlotCounters.SingleAsync(c => c.LocationId == bakery.LocationId && c.Date == bakery.PickupDate));
        Assert.Equal(3, counter.OrderCount);
    }

    [Fact]
    public async Task Pickup_slot_item_capacity_cannot_be_exceeded()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 100, maxItemsPerSlot: 5);
        var client = factory.CreateApiClient();

        var responses = await RaceAsync(10, _ => client.PostOrderAsync(bakery.OrderRequest((0, 2))));

        AssertNoServerErrors(responses);
        Assert.Equal(2, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        var counter = await _data.QueryAsync(db => db.PickupSlotCounters.SingleAsync(c => c.LocationId == bakery.LocationId && c.Date == bakery.PickupDate));
        Assert.Equal(4, counter.ItemCount);
    }

    [Fact]
    public async Task Concurrent_duplicate_submissions_with_same_idempotency_key_create_one_order()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 50);
        var client = factory.CreateApiClient();
        var key = Guid.NewGuid().ToString();
        var request = bakery.OrderRequest((0, 3));

        var responses = await RaceAsync(10, _ => client.PostOrderAsync(request, key));

        AssertNoServerErrors(responses);
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        var references = new HashSet<string>();
        foreach (var r in responses) references.Add((await r.ReadAsync<CreateOrderResponse>()).Order.PublicReference);
        Assert.Single(references);
        Assert.Equal(1, await _data.QueryAsync(db => db.Orders.CountAsync(o => o.TenantId == bakery.TenantId)));
        Assert.Equal(3, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
    }

    [Fact]
    public async Task Sequential_duplicate_submission_returns_original_order_and_token()
    {
        var bakery = await _data.CreateBakeryAsync();
        var client = factory.CreateApiClient();
        var key = Guid.NewGuid().ToString();

        var first = await (await client.PostOrderAsync(bakery.OrderRequest((0, 1)), key)).ReadAsync<CreateOrderResponse>();
        var second = await (await client.PostOrderAsync(bakery.OrderRequest((0, 1)), key)).ReadAsync<CreateOrderResponse>();

        Assert.Equal(first.Order.PublicReference, second.Order.PublicReference);
        Assert.Equal(first.AccessToken, second.AccessToken);
        Assert.Equal(1, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
    }

    [Fact]
    public async Task Reusing_an_idempotency_key_for_a_different_request_is_rejected()
    {
        var bakery = await _data.CreateBakeryAsync();
        var client = factory.CreateApiClient();
        var key = Guid.NewGuid().ToString();
        (await client.PostOrderAsync(bakery.OrderRequest((0, 1)), key)).AssertStatus(HttpStatusCode.Created);

        var response = await client.PostOrderAsync(bakery.OrderRequest((0, 2)), key);

        response.AssertStatus(HttpStatusCode.UnprocessableEntity);
        Assert.Equal("idempotency_key_reused", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task Repeated_concurrent_cancellation_restores_stock_exactly_once()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var client = factory.CreateApiClient();
        var order = await (await client.PostOrderAsync(bakery.OrderRequest((0, 4)))).ReadAsync<CreateOrderResponse>();
        var headers = new Dictionary<string, string> { ["X-Order-Token"] = order.AccessToken };

        var responses = await RaceAsync(10, _ => client.SendJsonAsync(HttpMethod.Post,
            $"/api/v1/public/orders/{order.Order.PublicReference}/cancel", headers: headers));

        AssertNoServerErrors(responses);
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        Assert.Equal(0, inv.ReservedQuantity);
        var counter = await _data.QueryAsync(db => db.PickupSlotCounters.SingleAsync(c => c.LocationId == bakery.LocationId && c.Date == bakery.PickupDate));
        Assert.Equal(0, counter.OrderCount);
        Assert.Equal(0, counter.ItemCount);
        var history = await _data.QueryAsync(db => db.OrderStatusHistory.CountAsync(h => h.ToStatus == OrderStatus.Cancelled
            && db.Orders.Any(o => o.Id == h.OrderId && o.PublicReference == order.Order.PublicReference)));
        Assert.Equal(1, history);
    }

    [Fact]
    public async Task An_order_cannot_be_collected_twice_even_concurrently()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var client = factory.CreateApiClient();
        var order = await (await client.PostOrderAsync(bakery.OrderRequest((0, 3)))).ReadAsync<CreateOrderResponse>();
        var staff = await client.LoginAsync(bakery.StaffEmail);
        var detail = await (await client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/lookup?code={order.Order.PublicReference}", bearer: staff))
            .ReadAsync<OrderDetailDto>();

        var responses = await RaceAsync(8, _ => client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{detail.Id}/collect", bearer: staff));

        AssertNoServerErrors(responses);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        foreach (var r in responses.Where(r => r.StatusCode != HttpStatusCode.OK))
        {
            Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
            Assert.Contains(await r.ErrorCodeAsync(), new[] { "order_already_collected", "order_modified_concurrently" });
        }
        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        Assert.Equal(0, inv.ReservedQuantity);
        Assert.Equal(3, inv.CollectedQuantity);
        Assert.Equal(7, inv.Remaining); // collected units are never sold again

        var again = await client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{detail.Id}/collect", bearer: staff);
        again.AssertStatus(HttpStatusCode.Conflict);
        Assert.Equal("order_already_collected", await again.ErrorCodeAsync());
    }

    [Fact]
    public async Task Concurrent_cancel_and_collect_leave_a_single_consistent_outcome()
    {
        for (var round = 0; round < 5; round++)
        {
            var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
            var client = factory.CreateApiClient();
            var order = await (await client.PostOrderAsync(bakery.OrderRequest((0, 2)))).ReadAsync<CreateOrderResponse>();
            var owner = await client.LoginAsync(bakery.OwnerEmail);
            var id = (await (await client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/lookup?code={order.Order.PublicReference}", bearer: owner))
                .ReadAsync<OrderDetailDto>()).Id;

            var responses = await RaceAsync(2, i => i == 0
                ? client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/collect", bearer: owner)
                : client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/cancel", new OrderActionRequest("Ware beschädigt"), bearer: owner));

            AssertNoServerErrors(responses);
            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
            var status = await _data.QueryAsync(db => db.Orders.Where(o => o.Id == id).Select(o => o.Status).SingleAsync());
            var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
            Assert.Equal(0, inv.ReservedQuantity);
            Assert.Equal(status == OrderStatus.Collected ? 2 : 0, inv.CollectedQuantity);
            Assert.Contains(status, new[] { OrderStatus.Collected, OrderStatus.Cancelled });
        }
    }

    [Fact]
    public async Task Concurrent_staff_status_changes_cannot_produce_an_invalid_state()
    {
        var bakery = await _data.CreateBakeryAsync();
        var client = factory.CreateApiClient();
        var order = await (await client.PostOrderAsync(bakery.OrderRequest((0, 1)))).ReadAsync<CreateOrderResponse>();
        var staff = await client.LoginAsync(bakery.StaffEmail);
        var id = (await (await client.SendJsonAsync(HttpMethod.Get, $"/api/v1/admin/orders/lookup?code={order.Order.PublicReference}", bearer: staff))
            .ReadAsync<OrderDetailDto>()).Id;

        var actions = new[] { "prepare", "ready", "prepare", "ready", "collect", "prepare" };
        var responses = await RaceAsync(actions.Length, i => client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/orders/{id}/{actions[i]}", bearer: staff));

        AssertNoServerErrors(responses);
        var history = await _data.QueryAsync(db => db.OrderStatusHistory.Where(h => h.OrderId == id).OrderBy(h => h.CreatedAt).ToListAsync());
        // Every recorded transition must start where the previous one ended.
        for (var i = 1; i < history.Count; i++) Assert.Equal(history[i - 1].ToStatus, history[i].FromStatus);
    }

    [Fact]
    public async Task Reducing_stock_below_existing_reservations_is_rejected_and_reservations_survive()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var client = factory.CreateApiClient();
        (await client.PostOrderAsync(bakery.OrderRequest((0, 6)))).AssertStatus(HttpStatusCode.Created);
        var owner = await client.LoginAsync(bakery.OwnerEmail);

        var tooLow = await client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(bakery.LocationId, bakery.PickupDate, [new DailyInventoryItemRequest(bakery.Products[0].Id, 5, 0, false)]), bearer: owner);
        tooLow.AssertStatus(HttpStatusCode.Conflict);
        Assert.Equal("quantity_below_reservations", await tooLow.ErrorCodeAsync());

        var bufferTooHigh = await client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(bakery.LocationId, bakery.PickupDate, [new DailyInventoryItemRequest(bakery.Products[0].Id, 10, 5, false)]), bearer: owner);
        bufferTooHigh.AssertStatus(HttpStatusCode.Conflict);

        var exact = await client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(bakery.LocationId, bakery.PickupDate, [new DailyInventoryItemRequest(bakery.Products[0].Id, 6, 0, false)]), bearer: owner);
        exact.AssertStatus(HttpStatusCode.OK);

        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        Assert.Equal(6, inv.PlannedQuantity);
        Assert.Equal(6, inv.ReservedQuantity);
        Assert.Equal(1, await _data.QueryAsync(db => db.Orders.CountAsync(o => o.TenantId == bakery.TenantId && o.Status == OrderStatus.Confirmed)));

        (await client.PostOrderAsync(bakery.OrderRequest((0, 1)))).AssertStatus(HttpStatusCode.Conflict); // now sold out
    }

    [Fact]
    public async Task Stock_reduction_racing_with_reservations_never_violates_invariants()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 20);
        var client = factory.CreateApiClient();
        var owner = await client.LoginAsync(bakery.OwnerEmail);

        var responses = await RaceAsync(21, i => i == 0
            ? client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
                new UpdateDailyInventoryRequest(bakery.LocationId, bakery.PickupDate, [new DailyInventoryItemRequest(bakery.Products[0].Id, 8, 0, false)]), bearer: owner)
            : client.PostOrderAsync(bakery.OrderRequest((0, 1))));

        AssertNoServerErrors(responses);
        var inv = await _data.GetInventoryAsync(bakery.Products[0].InventoryId);
        Assert.True(inv.ReservedQuantity <= inv.PlannedQuantity - inv.SafetyBuffer);
        var reservedByOrders = await _data.QueryAsync(db => db.OrderItems.Where(i => i.DailyInventoryId == inv.Id).SumAsync(i => i.Quantity));
        Assert.Equal(reservedByOrders, inv.ReservedQuantity);
    }

    [Fact]
    public async Task Marking_product_unavailable_or_unpublished_keeps_confirmed_reservations()
    {
        var bakery = await _data.CreateBakeryAsync(stockPerProduct: 10);
        var client = factory.CreateApiClient();
        var order = await (await client.PostOrderAsync(bakery.OrderRequest((0, 2)))).ReadAsync<CreateOrderResponse>();
        var owner = await client.LoginAsync(bakery.OwnerEmail);

        (await client.SendJsonAsync(HttpMethod.Put, "/api/v1/admin/inventory/daily",
            new UpdateDailyInventoryRequest(bakery.LocationId, bakery.PickupDate, [new DailyInventoryItemRequest(bakery.Products[0].Id, 10, 0, true)]), bearer: owner))
            .AssertStatus(HttpStatusCode.OK);
        var unpublish = await (await client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/products/{bakery.Products[0].Id}/unpublish", bearer: owner))
            .ReadAsync<ProductStatusChangeResult>();
        Assert.Equal(1, unpublish.ActiveReservations);
        Assert.NotNull(unpublish.Message);

        var archive = await client.SendJsonAsync(HttpMethod.Post, $"/api/v1/admin/products/{bakery.Products[0].Id}/archive", bearer: owner);
        archive.AssertStatus(HttpStatusCode.Conflict);
        Assert.Equal("product_has_active_reservations", await archive.ErrorCodeAsync());

        var view = await (await client.SendJsonAsync(HttpMethod.Get, $"/api/v1/public/orders/{order.Order.PublicReference}",
            headers: new Dictionary<string, string> { ["X-Order-Token"] = order.AccessToken })).ReadAsync<PublicOrderDto>();
        Assert.Equal(OrderStatus.Confirmed, view.Status);
        Assert.Equal(2, (await _data.GetInventoryAsync(bakery.Products[0].InventoryId)).ReservedQuantity);
        (await client.PostOrderAsync(bakery.OrderRequest((0, 1)))).AssertStatus(HttpStatusCode.UnprocessableEntity); // no longer orderable
    }
}
