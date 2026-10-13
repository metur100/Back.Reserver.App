using BackReserve.Domain.Common;
using BackReserve.Domain.Enums;

namespace BackReserve.Domain.Rules;

/// <summary>
/// Explicit order lifecycle. A successful reservation is immediately <see cref="OrderStatus.Confirmed"/>;
/// there is no pending state because no manual approval or online payment is required in the MVP.
/// </summary>
public static class OrderStateMachine
{
    private static readonly Dictionary<OrderStatus, OrderStatus[]> Allowed = new()
    {
        [OrderStatus.Confirmed] = [OrderStatus.Preparing, OrderStatus.ReadyForPickup, OrderStatus.Collected, OrderStatus.Cancelled, OrderStatus.NoShow],
        [OrderStatus.Preparing] = [OrderStatus.ReadyForPickup, OrderStatus.Collected, OrderStatus.Cancelled, OrderStatus.NoShow],
        [OrderStatus.ReadyForPickup] = [OrderStatus.Collected, OrderStatus.Cancelled, OrderStatus.NoShow],
        [OrderStatus.Collected] = [],
        [OrderStatus.Cancelled] = [],
        [OrderStatus.NoShow] = [],
    };

    /// <summary>Active orders hold reserved stock and slot capacity.</summary>
    public static bool IsActive(OrderStatus status) =>
        status is OrderStatus.Confirmed or OrderStatus.Preparing or OrderStatus.ReadyForPickup;

    public static bool CanTransition(OrderStatus from, OrderStatus to) => Allowed[from].Contains(to);

    public static void EnsureCanTransition(OrderStatus from, OrderStatus to)
    {
        if (CanTransition(from, to)) return;
        var code = (from, to) switch
        {
            (OrderStatus.Collected, OrderStatus.Collected) => "order_already_collected",
            (OrderStatus.Cancelled, OrderStatus.Cancelled) => "order_already_cancelled",
            (OrderStatus.Cancelled, _) => "order_cancelled",
            (OrderStatus.Collected, _) => "order_already_collected",
            _ => "invalid_status_transition",
        };
        throw new DomainException(code, $"Statuswechsel von {from} nach {to} ist nicht erlaubt.");
    }
}
