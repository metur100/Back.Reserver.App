using BackReserve.Domain.Enums;

namespace BackReserve.Application.Contracts;

public sealed record PublicBakeryDto(
    string Name,
    string Slug,
    string? Description,
    string? LogoUrl,
    string? CoverImageUrl,
    string? BrandColor,
    string? ContactEmail,
    string? ContactPhone,
    string? Website,
    string? PickupInstructions,
    string? CancellationPolicyText,
    string? AllergenDisclaimer,
    bool RequireCustomerLastName,
    bool RequireCustomerPhone,
    string Currency,
    IReadOnlyList<PublicLocationDto> Locations,
    IReadOnlyList<PublicCategoryDto> Categories);

public sealed record OpeningHoursDto(
    DayOfWeek DayOfWeek, bool IsOpen, TimeOnly? OpensAt, TimeOnly? ClosesAt, TimeOnly PickupStart, TimeOnly PickupEnd);

public sealed record PublicLocationDto(
    Guid Id,
    string Name,
    string Street,
    string PostalCode,
    string City,
    string? Phone,
    string? Email,
    string TimeZoneId,
    bool AcceptsOrders,
    int MaxDaysAhead,
    int OrderCutoffDaysBefore,
    TimeOnly OrderCutoffTime,
    int CancellationCutoffDaysBefore,
    TimeOnly CancellationCutoffTime,
    IReadOnlyList<OpeningHoursDto> OpeningHours);

public sealed record PublicCategoryDto(Guid Id, string Name, string Slug, int SortOrder);

public sealed record PublicAvailableDateDto(DateOnly Date, bool IsOrderable, string Status, DateTimeOffset? OrderCutoffAt);

public enum AvailabilityStatus
{
    Available,
    Low,
    SoldOut,
}

public sealed record PublicProductDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    Guid? CategoryId,
    decimal Price,
    string Currency,
    string? ImageUrl,
    string? Allergens,
    string? Ingredients,
    IReadOnlyList<string> DietaryLabels,
    int LeadTimeHours,
    int Remaining,
    AvailabilityStatus Availability);

public sealed record PublicProductListDto(Guid LocationId, DateOnly Date, bool DateIsOrderable, string DateStatus, IReadOnlyList<PublicProductDto> Products);

public sealed record PickupSlotDto(TimeOnly Start, TimeOnly End, DateTimeOffset StartUtc, bool Available, int RemainingOrders, string? UnavailableReason);

public sealed record PickupSlotListDto(Guid LocationId, DateOnly Date, bool DateIsOrderable, string DateStatus, IReadOnlyList<PickupSlotDto> Slots);

public sealed record CreateOrderItemRequest(Guid ProductId, int Quantity);

public sealed record CustomerDetailsRequest(string FirstName, string? LastName, string Email, string? Phone);

public sealed record CreateOrderRequest(
    Guid LocationId,
    DateOnly PickupDate,
    TimeOnly SlotStart,
    IReadOnlyList<CreateOrderItemRequest> Items,
    CustomerDetailsRequest Customer,
    string? Note,
    bool AcceptTerms);

public sealed record PublicOrderItemDto(string ProductName, decimal UnitPrice, int Quantity, decimal LineTotal);

public sealed record PublicOrderLocationDto(string Name, string Street, string PostalCode, string City, string? Phone);

public sealed record PublicOrderDto(
    string PublicReference,
    OrderStatus Status,
    string BakeryName,
    string BakerySlug,
    PublicOrderLocationDto Location,
    DateOnly PickupDate,
    TimeOnly SlotStart,
    TimeOnly SlotEnd,
    IReadOnlyList<PublicOrderItemDto> Items,
    decimal Subtotal,
    decimal Total,
    string Currency,
    PaymentMode PaymentMode,
    string CustomerFirstName,
    string? CustomerNote,
    DateTimeOffset CreatedAt,
    bool CanCancel,
    DateTimeOffset CancellationDeadline,
    DateTimeOffset? CancelledAt,
    string? PickupInstructions,
    string? CancellationPolicyText);

/// <summary>The access token is returned exactly once to the creating client and by email; only its hash is stored.</summary>
public sealed record CreateOrderResponse(PublicOrderDto Order, string AccessToken);
