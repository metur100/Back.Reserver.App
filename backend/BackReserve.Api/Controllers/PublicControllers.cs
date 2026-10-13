using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Orders;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BackReserve.Api.Controllers;

[ApiController]
[Route("api/v1/public")]
[EnableRateLimiting("public-read")]
[Tags("Public catalog")]
public sealed class PublicCatalogController(PublicCatalogService catalog) : ControllerBase
{
    [HttpGet("bakeries/{slug}")]
    public Task<PublicBakeryDto> GetBakery(string slug, CancellationToken ct) => catalog.GetBakeryAsync(slug, ct);

    [HttpGet("bakeries/{slug}/locations")]
    public Task<IReadOnlyList<PublicLocationDto>> GetLocations(string slug, CancellationToken ct) => catalog.GetLocationsAsync(slug, ct);

    /// <summary>Orderable pickup dates for a location.</summary>
    [HttpGet("bakeries/{slug}/availability")]
    public Task<IReadOnlyList<PublicAvailableDateDto>> GetAvailability(string slug, [FromQuery] Guid locationId, CancellationToken ct) =>
        catalog.GetAvailableDatesAsync(slug, locationId, ct);

    /// <summary>Published products with stock for the given location and pickup date.</summary>
    [HttpGet("bakeries/{slug}/products")]
    public Task<PublicProductListDto> GetProducts(string slug, [FromQuery] Guid locationId, [FromQuery] DateOnly date, CancellationToken ct) =>
        catalog.GetProductsAsync(slug, locationId, date, ct);

    [HttpGet("locations/{locationId:guid}/pickup-slots")]
    public Task<PickupSlotListDto> GetPickupSlots(Guid locationId, [FromQuery] DateOnly date, [FromQuery] Guid[]? productIds, CancellationToken ct) =>
        catalog.GetPickupSlotsAsync(locationId, date, productIds, ct);
}

/// <summary>
/// Guest reservations. Lookup and cancellation require the capability token from the confirmation (header X-Order-Token);
/// the short public reference alone never grants access.
/// </summary>
[ApiController]
[Route("api/v1/public/orders")]
[Tags("Public orders")]
public sealed class PublicOrdersController(ReservationService reservations) : ControllerBase
{
    public const string TokenHeader = "X-Order-Token";

    [HttpPost]
    [EnableRateLimiting("public-orders")]
    [ProducesResponseType<CreateOrderResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<CreateOrderResponse>> Create(
        CreateOrderRequest request, [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
    {
        if (idempotencyKey is { Length: > 100 } || (idempotencyKey is not null && idempotencyKey.Length < 8))
            throw new BusinessRuleException("invalid_idempotency_key", "Ungültiger Idempotency-Key.");
        var result = await reservations.CreateAsync(request, idempotencyKey, ct);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpGet("{publicReference}")]
    [EnableRateLimiting("order-lookup")]
    public Task<PublicOrderDto> Get(string publicReference, [FromHeader(Name = TokenHeader)] string? token, CancellationToken ct) =>
        reservations.GetAsync(publicReference, token, ct);

    [HttpPost("{publicReference}/cancel")]
    [EnableRateLimiting("order-lookup")]
    public Task<PublicOrderDto> Cancel(string publicReference, [FromHeader(Name = TokenHeader)] string? token, CancellationToken ct) =>
        reservations.CancelAsync(publicReference, token, ct);
}
