using BackReserve.Application.Contracts;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;

namespace BackReserve.Application.Orders;

public static class OrderMapping
{
    public static string StatusLink(string webBaseUrl, string publicReference, string accessToken) =>
        // The token travels in the URL fragment, which browsers never send to servers or in Referer headers.
        $"{webBaseUrl.TrimEnd('/')}/bestellung/{publicReference}#t={accessToken}";

    public static PublicOrderDto ToPublicDto(
        Order order, Tenant tenant, BakeryLocation location, LocationSettings settings, CustomerContact customer,
        IEnumerable<OrderItem> items, DateTimeOffset nowUtc)
    {
        var tz = PickupCalendar.ResolveTimeZone(settings.TimeZoneId);
        var deadline = PickupCalendar.CancellationCutoffUtc(order.PickupDate, settings, tz);
        var canCancel = OrderStateMachine.IsActive(order.Status) && nowUtc < deadline;
        return new PublicOrderDto(
            order.PublicReference, order.Status, tenant.Name, tenant.Slug,
            new PublicOrderLocationDto(location.Name, location.Street, location.PostalCode, location.City, location.Phone),
            order.PickupDate, order.SlotStart, order.SlotEnd,
            items.Select(i => new PublicOrderItemDto(i.ProductName, i.UnitPrice, i.Quantity, i.LineTotal)).ToList(),
            order.Subtotal, order.Total, order.Currency, order.PaymentMode, customer.FirstName, order.CustomerNote, order.CreatedAt,
            canCancel, deadline, order.CancelledAt, tenant.Settings?.PickupInstructions, tenant.Settings?.CancellationPolicyText);
    }

    public static IReadOnlyList<string> AllowedActions(OrderStatus status) => status switch
    {
        OrderStatus.Confirmed => ["prepare", "ready", "collect", "cancel", "no-show"],
        OrderStatus.Preparing => ["ready", "collect", "cancel", "no-show"],
        OrderStatus.ReadyForPickup => ["collect", "cancel", "no-show"],
        _ => [],
    };

    public static string CustomerDisplayName(CustomerContact c) =>
        c.AnonymizedAt is not null ? "Anonymisiert" : string.IsNullOrWhiteSpace(c.LastName) ? c.FirstName : $"{c.FirstName} {c.LastName}";
}
