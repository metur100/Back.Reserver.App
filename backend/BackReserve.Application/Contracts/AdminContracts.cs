using BackReserve.Domain.Enums;

namespace BackReserve.Application.Contracts;

// ---------- Orders ----------

public sealed record OrderQuery(
    Guid? LocationId = null,
    DateOnly? DateFrom = null,
    DateOnly? DateTo = null,
    OrderStatus[]? Status = null,
    TimeOnly? SlotStart = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 25);

public sealed record OrderListItemDto(
    Guid Id,
    string PublicReference,
    Guid LocationId,
    string LocationName,
    DateOnly PickupDate,
    TimeOnly SlotStart,
    TimeOnly SlotEnd,
    OrderStatus Status,
    string CustomerName,
    int ItemCount,
    decimal Total,
    string Currency,
    bool HasNote,
    DateTimeOffset CreatedAt);

public sealed record OrderItemDto(Guid ProductId, string ProductName, decimal UnitPrice, int Quantity, decimal LineTotal);

public sealed record OrderHistoryDto(OrderStatus? FromStatus, OrderStatus ToStatus, string Actor, string? ChangedByName, string? Note, DateTimeOffset CreatedAt);

public sealed record OrderDetailDto(
    Guid Id,
    string PublicReference,
    Guid LocationId,
    string LocationName,
    DateOnly PickupDate,
    TimeOnly SlotStart,
    TimeOnly SlotEnd,
    OrderStatus Status,
    PaymentMode PaymentMode,
    string CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? CustomerNote,
    IReadOnlyList<OrderItemDto> Items,
    int ItemCount,
    decimal Subtotal,
    decimal Total,
    string Currency,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CollectedAt,
    DateTimeOffset? CancelledAt,
    string? CancellationReason,
    IReadOnlyList<OrderHistoryDto> History,
    IReadOnlyList<string> AllowedActions);

public sealed record OrderActionRequest(string? Reason);

public sealed record ReportProblemRequest(string Note);

// ---------- Products ----------

public sealed record CategoryDto(Guid Id, string Name, string Slug, int SortOrder, bool IsActive, int ProductCount);

public sealed record UpsertCategoryRequest(string Name, int SortOrder, bool IsActive = true);

public sealed record ProductQuery(Guid? CategoryId = null, string? Status = null, string? Search = null, int Page = 1, int PageSize = 50);

public sealed record ProductDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    Guid? CategoryId,
    string? CategoryName,
    decimal BasePrice,
    string Currency,
    string? ImageUrl,
    bool IsPublished,
    bool IsArchived,
    string? Allergens,
    string? Ingredients,
    IReadOnlyList<string> DietaryLabels,
    int LeadTimeHours,
    int? DefaultDailyQuantity,
    int SortOrder,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record UpsertProductRequest(
    string Name,
    string? Description,
    Guid? CategoryId,
    decimal BasePrice,
    string? ImageUrl,
    string? Allergens,
    string? Ingredients,
    IReadOnlyList<string>? DietaryLabels,
    int LeadTimeHours,
    int? DefaultDailyQuantity,
    int SortOrder);

public sealed record ProductStatusChangeResult(ProductDto Product, int ActiveReservations, string? Message);

// ---------- Inventory / production ----------

public sealed record DailyInventoryRowDto(
    Guid? InventoryId,
    Guid ProductId,
    string ProductName,
    string? CategoryName,
    bool IsPublished,
    int PlannedQuantity,
    int SafetyBuffer,
    int ReservedQuantity,
    int CollectedQuantity,
    int NoShowQuantity,
    int MaxSellable,
    int Remaining,
    bool IsUnavailable,
    bool IsLowStock);

public sealed record DailyInventoryDto(Guid LocationId, DateOnly Date, IReadOnlyList<DailyInventoryRowDto> Rows);

public sealed record DailyInventoryItemRequest(Guid ProductId, int PlannedQuantity, int SafetyBuffer, bool IsUnavailable);

public sealed record UpdateDailyInventoryRequest(Guid LocationId, DateOnly Date, IReadOnlyList<DailyInventoryItemRequest> Items);

public sealed record CopyDayRequest(Guid LocationId, DateOnly SourceDate, DateOnly TargetDate, bool Overwrite);

public sealed record CopyDayResult(int Created, int Updated, int Skipped, IReadOnlyList<string> Warnings);

public sealed record ProductionSlotQuantityDto(TimeOnly SlotStart, int Quantity);

public sealed record ProductionProductDto(
    Guid ProductId, string ProductName, int PlannedQuantity, int SafetyBuffer, int ReservedQuantity, int CollectedQuantity,
    int Remaining, bool IsUnavailable, bool IsLowStock, IReadOnlyList<ProductionSlotQuantityDto> BySlot);

public sealed record ProductionSlotDto(TimeOnly SlotStart, TimeOnly SlotEnd, int OrderCount, int ItemCount, int? MaxOrders);

public sealed record ProductionOverviewDto(Guid LocationId, DateOnly Date, IReadOnlyList<ProductionProductDto> Products, IReadOnlyList<ProductionSlotDto> Slots);

// ---------- Locations ----------

public sealed record LocationSettingsDto(
    string TimeZoneId,
    bool AcceptsOrders,
    int OrderCutoffDaysBefore,
    TimeOnly OrderCutoffTime,
    int MinAdvanceMinutes,
    int MaxDaysAhead,
    int CancellationCutoffDaysBefore,
    TimeOnly CancellationCutoffTime);

public sealed record ScheduleRuleDto(
    DayOfWeek DayOfWeek,
    bool IsOpen,
    TimeOnly? OpensAt,
    TimeOnly? ClosesAt,
    TimeOnly PickupStart,
    TimeOnly PickupEnd,
    int SlotMinutes,
    int MaxOrdersPerSlot,
    int? MaxItemsPerSlot);

public sealed record ClosureDto(Guid Id, DateOnly Date, string? Reason);

public sealed record LocationDto(
    Guid Id,
    string Name,
    string Street,
    string PostalCode,
    string City,
    string Country,
    string? Phone,
    string? Email,
    bool IsActive,
    LocationSettingsDto Settings,
    IReadOnlyList<ScheduleRuleDto> Schedule,
    IReadOnlyList<ClosureDto> Closures);

public sealed record UpsertLocationRequest(
    string Name,
    string Street,
    string PostalCode,
    string City,
    string? Country,
    string? Phone,
    string? Email,
    bool IsActive,
    LocationSettingsDto Settings);

public sealed record UpdateScheduleRequest(Guid LocationId, IReadOnlyList<ScheduleRuleDto> Rules);

public sealed record AddClosureRequest(DateOnly Date, string? Reason);

// ---------- Staff ----------

public sealed record StaffMemberDto(
    Guid MembershipId,
    Guid UserId,
    string FirstName,
    string LastName,
    string Email,
    MembershipRole Role,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<Guid>? LocationIds,
    bool IsActive,
    bool IsCurrentUser);

public sealed record InvitationDto(Guid Id, string Email, MembershipRole Role, IReadOnlyList<Guid> LocationIds, DateTimeOffset ExpiresAt, string Status, DateTimeOffset CreatedAt);

public sealed record StaffOverviewDto(IReadOnlyList<StaffMemberDto> Members, IReadOnlyList<InvitationDto> Invitations, int MaxStaff);

public sealed record InviteStaffRequest(string Email, MembershipRole Role, IReadOnlyList<Guid> LocationIds, IReadOnlyList<Permission>? Permissions);

public sealed record UpdateMembershipRequest(MembershipRole Role, IReadOnlyList<Guid> LocationIds, IReadOnlyList<Permission>? Permissions, bool IsActive);

// ---------- Settings ----------

public sealed record TenantSettingsDto(
    Guid TenantId,
    string Name,
    string Slug,
    string? Description,
    string? LogoUrl,
    string? CoverImageUrl,
    string? BrandColor,
    string? ContactEmail,
    string? ContactPhone,
    string? Website,
    bool IsPublished,
    bool RequireCustomerLastName,
    bool RequireCustomerPhone,
    bool SendReadyNotification,
    bool SendPickupReminder,
    int PickupReminderHoursBefore,
    string? PickupInstructions,
    string? CancellationPolicyText,
    string? AllergenDisclaimer,
    int CustomerDataRetentionDays);

public sealed record UpdateTenantSettingsRequest(
    string Name,
    string? Description,
    string? LogoUrl,
    string? CoverImageUrl,
    string? BrandColor,
    string? ContactEmail,
    string? ContactPhone,
    string? Website,
    bool IsPublished,
    bool RequireCustomerLastName,
    bool RequireCustomerPhone,
    bool SendReadyNotification,
    bool SendPickupReminder,
    int PickupReminderHoursBefore,
    string? PickupInstructions,
    string? CancellationPolicyText,
    string? AllergenDisclaimer,
    int CustomerDataRetentionDays);

// ---------- Subscription ----------

public sealed record SubscriptionPlanDto(
    Guid Id, string Code, string Name, decimal MonthlyPrice, string Currency, int MaxLocations, int MaxProducts, int MaxStaff,
    bool ProductionPlanning, bool CsvExport, bool CustomBranding, bool EmailNotifications);

public sealed record SubscriptionDto(
    SubscriptionPlanDto Plan, SubscriptionStatus Status, DateTimeOffset? TrialEndsAt, DateTimeOffset? CurrentPeriodEndsAt,
    string BillingProvider, bool BillingConfigured, int LocationsUsed, int ProductsUsed, int StaffUsed);

public sealed record ChangePlanRequest(string PlanCode);

// ---------- Dashboard ----------

public sealed record DashboardSlotDto(TimeOnly SlotStart, TimeOnly SlotEnd, int Orders, int Items, int Open, int Ready, int Collected);

public sealed record LowStockDto(Guid ProductId, string ProductName, DateOnly Date, int Remaining, int MaxSellable);

public sealed record DashboardDto(
    Guid? LocationId,
    DateOnly Today,
    DateOnly Tomorrow,
    int ReservationsToday,
    int ReservationsTomorrow,
    int ReservedItemsToday,
    int ReservedItemsTomorrow,
    int ReadyForPickup,
    int Preparing,
    int AwaitingAction,
    decimal ReservedValueToday,
    decimal ReservedValueTomorrow,
    string Currency,
    int CancelledToday,
    IReadOnlyList<LowStockDto> LowStock,
    IReadOnlyList<DashboardSlotDto> TodaySchedule,
    IReadOnlyList<OrderListItemDto> RecentOrders,
    int UnreadNotifications);

// ---------- Reports ----------

public sealed record ReportQuery(Guid? LocationId, DateOnly From, DateOnly To);

public sealed record OrdersByDayDto(DateOnly Date, int Orders, int Items, decimal ReservedValue, int Collected, int Cancelled, int NoShow);

public sealed record ProductReportDto(Guid ProductId, string ProductName, int Quantity, decimal ReservedValue, int Orders);

public sealed record SlotReportDto(TimeOnly SlotStart, int Orders, int Items);

public sealed record ReportSummaryDto(
    DateOnly From, DateOnly To, int Orders, int Items, decimal ReservedValue, int Cancelled, int NoShow, int Collected, string Currency,
    IReadOnlyList<OrdersByDayDto> ByDay, IReadOnlyList<ProductReportDto> ByProduct, IReadOnlyList<SlotReportDto> BySlot);

// ---------- Platform ----------

public sealed record PlatformTenantDto(
    Guid Id, string Name, string Slug, TenantStatus Status, bool IsPublished, string? PlanCode, SubscriptionStatus? SubscriptionStatus,
    int Locations, DateTimeOffset CreatedAt);

public sealed record PlatformHealthDto(int Tenants, int ActiveTenants, int PendingOutbox, int FailedOutbox, DateTimeOffset? OldestPendingOutbox);

public sealed record NotificationDto(Guid Id, NotificationType Type, Guid? OrderId, string Message, DateTimeOffset CreatedAt, bool IsRead);
