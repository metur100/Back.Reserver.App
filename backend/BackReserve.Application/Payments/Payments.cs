using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;

namespace BackReserve.Application.Payments;

/// <summary>Outcome of starting payment for a freshly reserved order.</summary>
/// <param name="Mode">How the customer pays.</param>
/// <param name="IsPaid">True only when money has actually been captured by a provider. Never set for pay-at-pickup.</param>
/// <param name="RedirectUrl">Provider checkout URL for online payment flows; null for pay-at-pickup.</param>
public sealed record PaymentInitiation(PaymentMode Mode, bool IsPaid, string? RedirectUrl);

/// <summary>
/// Extension point for payment. The MVP only supports "Reservieren und bei Abholung bezahlen"; an online provider
/// (e.g. Stripe) will implement this interface in a separate milestone together with signed webhooks, idempotent
/// payment state reconciliation and refunds. Implementations must never report an order as paid without provider confirmation.
/// </summary>
public interface IPaymentGateway
{
    PaymentMode Mode { get; }

    /// <summary>Called inside the reservation transaction after stock is reserved and before the order is saved.</summary>
    Task<PaymentInitiation> InitiateAsync(Order order, CancellationToken ct);
}

/// <summary>The customer pays at the counter on pickup. Nothing is charged online and nothing is marked as paid.</summary>
public sealed class PayAtPickupGateway : IPaymentGateway
{
    public PaymentMode Mode => PaymentMode.PayAtPickup;

    public Task<PaymentInitiation> InitiateAsync(Order order, CancellationToken ct) =>
        Task.FromResult(new PaymentInitiation(PaymentMode.PayAtPickup, IsPaid: false, RedirectUrl: null));
}
