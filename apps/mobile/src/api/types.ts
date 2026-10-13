/**
 * Typed API models matching the backend DTOs (camelCase JSON).
 * Source of truth: backend/BackReserve.Application/Contracts/{PublicContracts,AdminContracts,AuthContracts}.cs
 * and backend/BackReserve.Domain/Enums/Enums.cs.
 *
 * Conventions: enums are PascalCase strings, DateOnly = "yyyy-MM-dd", TimeOnly = "HH:mm",
 * DateTimeOffset = ISO 8601 string, Guid = string, money = number with 2 decimals.
 */

export type Guid = string;
/** "yyyy-MM-dd" */
export type DateOnly = string;
/** "HH:mm" */
export type TimeOnly = string;
/** ISO 8601 date-time with offset */
export type DateTimeOffset = string;

// ---------- Enums ----------

export type OrderStatus = 'Confirmed' | 'Preparing' | 'ReadyForPickup' | 'Collected' | 'Cancelled' | 'NoShow';
export const ORDER_STATUSES: readonly OrderStatus[] = ['Confirmed', 'Preparing', 'ReadyForPickup', 'Collected', 'Cancelled', 'NoShow'];

export type AvailabilityStatus = 'Available' | 'Low' | 'SoldOut';
export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type PaymentMode = 'PayAtPickup';
export type MembershipRole = 'Owner' | 'Manager' | 'Staff';
export type TenantStatus = 'Active' | 'Suspended';

export type Permission =
  | 'OrdersView'
  | 'OrdersProcess'
  | 'PickupCollect'
  | 'OrdersCancel'
  | 'CustomerContactView'
  | 'ProductsManage'
  | 'InventoryManage'
  | 'LocationsManage'
  | 'PickupScheduleManage'
  | 'StaffManage'
  | 'ReportsView'
  | 'SettingsManage'
  | 'SubscriptionManage';

/** Date availability codes returned as `status` / `dateStatus` (LocationSchedule.StatusCode). */
export type DateStatus =
  | 'open'
  | 'past'
  | 'too_far_ahead'
  | 'closed'
  | 'no_pickup'
  | 'cutoff_passed'
  | 'not_accepting_orders'
  | 'unavailable';

/** Slot unavailability reasons (PublicCatalogService). */
export type SlotUnavailableReason = 'too_soon' | 'full';

/** Admin order actions (OrderMapping.AllowedActions, filtered by permissions). */
export type OrderAction = 'prepare' | 'ready' | 'collect' | 'cancel' | 'no-show';

// ---------- Public catalog ----------

export interface OpeningHoursDto {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  opensAt: TimeOnly | null;
  closesAt: TimeOnly | null;
  pickupStart: TimeOnly;
  pickupEnd: TimeOnly;
}

export interface PublicLocationDto {
  id: Guid;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string | null;
  email: string | null;
  timeZoneId: string;
  acceptsOrders: boolean;
  maxDaysAhead: number;
  orderCutoffDaysBefore: number;
  orderCutoffTime: TimeOnly;
  cancellationCutoffDaysBefore: number;
  cancellationCutoffTime: TimeOnly;
  openingHours: OpeningHoursDto[];
}

export interface PublicCategoryDto {
  id: Guid;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface PublicBakeryDto {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  brandColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  pickupInstructions: string | null;
  cancellationPolicyText: string | null;
  allergenDisclaimer: string | null;
  requireCustomerLastName: boolean;
  requireCustomerPhone: boolean;
  currency: string;
  locations: PublicLocationDto[];
  categories: PublicCategoryDto[];
}

export interface PublicAvailableDateDto {
  date: DateOnly;
  isOrderable: boolean;
  status: DateStatus | string;
  orderCutoffAt: DateTimeOffset | null;
}

export interface PublicProductDto {
  id: Guid;
  name: string;
  slug: string;
  description: string | null;
  categoryId: Guid | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  allergens: string | null;
  ingredients: string | null;
  dietaryLabels: string[];
  leadTimeHours: number;
  remaining: number;
  availability: AvailabilityStatus;
}

export interface PublicProductListDto {
  locationId: Guid;
  date: DateOnly;
  dateIsOrderable: boolean;
  dateStatus: DateStatus | string;
  products: PublicProductDto[];
}

export interface PickupSlotDto {
  start: TimeOnly;
  end: TimeOnly;
  startUtc: DateTimeOffset;
  available: boolean;
  remainingOrders: number;
  unavailableReason: SlotUnavailableReason | string | null;
}

export interface PickupSlotListDto {
  locationId: Guid;
  date: DateOnly;
  dateIsOrderable: boolean;
  dateStatus: DateStatus | string;
  slots: PickupSlotDto[];
}

// ---------- Public orders ----------

export interface CreateOrderItemRequest {
  productId: Guid;
  quantity: number;
}

export interface CustomerDetailsRequest {
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
}

/** Never contains prices: the server is authoritative. */
export interface CreateOrderRequest {
  locationId: Guid;
  pickupDate: DateOnly;
  slotStart: TimeOnly;
  items: CreateOrderItemRequest[];
  customer: CustomerDetailsRequest;
  note: string | null;
  acceptTerms: boolean;
}

export interface PublicOrderItemDto {
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface PublicOrderLocationDto {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string | null;
}

export interface PublicOrderDto {
  publicReference: string;
  status: OrderStatus;
  bakeryName: string;
  bakerySlug: string;
  location: PublicOrderLocationDto;
  pickupDate: DateOnly;
  slotStart: TimeOnly;
  slotEnd: TimeOnly;
  items: PublicOrderItemDto[];
  subtotal: number;
  total: number;
  currency: string;
  paymentMode: PaymentMode;
  customerFirstName: string;
  customerNote: string | null;
  createdAt: DateTimeOffset;
  canCancel: boolean;
  cancellationDeadline: DateTimeOffset;
  cancelledAt: DateTimeOffset | null;
  pickupInstructions: string | null;
  cancellationPolicyText: string | null;
}

export interface CreateOrderResponse {
  order: PublicOrderDto;
  /** Capability token for lookup/cancel (X-Order-Token). Returned exactly once. */
  accessToken: string;
}

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface MembershipDto {
  tenantId: Guid;
  tenantName: string;
  tenantSlug: string;
  role: MembershipRole;
  permissions: (Permission | string)[];
  locationIds: Guid[] | null;
  tenantStatus: TenantStatus;
}

export interface MeDto {
  userId: Guid;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
  memberships: MembershipDto[];
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: DateTimeOffset;
  /** Present for mobile clients (X-Client-Type: mobile). */
  refreshToken: string | null;
  user: MeDto;
}

// ---------- Admin ----------

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface OrderQuery {
  locationId?: Guid;
  dateFrom?: DateOnly;
  dateTo?: DateOnly;
  status?: OrderStatus[];
  slotStart?: TimeOnly;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderListItemDto {
  id: Guid;
  publicReference: string;
  locationId: Guid;
  locationName: string;
  pickupDate: DateOnly;
  slotStart: TimeOnly;
  slotEnd: TimeOnly;
  status: OrderStatus;
  customerName: string;
  itemCount: number;
  total: number;
  currency: string;
  hasNote: boolean;
  createdAt: DateTimeOffset;
}

export interface OrderItemDto {
  productId: Guid;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderHistoryDto {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: string;
  changedByName: string | null;
  note: string | null;
  createdAt: DateTimeOffset;
}

export interface OrderDetailDto {
  id: Guid;
  publicReference: string;
  locationId: Guid;
  locationName: string;
  pickupDate: DateOnly;
  slotStart: TimeOnly;
  slotEnd: TimeOnly;
  status: OrderStatus;
  paymentMode: PaymentMode;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  items: OrderItemDto[];
  itemCount: number;
  subtotal: number;
  total: number;
  currency: string;
  createdAt: DateTimeOffset;
  collectedAt: DateTimeOffset | null;
  cancelledAt: DateTimeOffset | null;
  cancellationReason: string | null;
  history: OrderHistoryDto[];
  allowedActions: (OrderAction | string)[];
}

export interface OrderActionRequest {
  reason: string | null;
}

export interface LocationSettingsDto {
  timeZoneId: string;
  acceptsOrders: boolean;
  orderCutoffDaysBefore: number;
  orderCutoffTime: TimeOnly;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
  cancellationCutoffDaysBefore: number;
  cancellationCutoffTime: TimeOnly;
}

export interface ScheduleRuleDto {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  opensAt: TimeOnly | null;
  closesAt: TimeOnly | null;
  pickupStart: TimeOnly;
  pickupEnd: TimeOnly;
  slotMinutes: number;
  maxOrdersPerSlot: number;
  maxItemsPerSlot: number | null;
}

export interface ClosureDto {
  id: Guid;
  date: DateOnly;
  reason: string | null;
}

export interface LocationDto {
  id: Guid;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  settings: LocationSettingsDto;
  schedule: ScheduleRuleDto[];
  closures: ClosureDto[];
}

export interface DashboardSlotDto {
  slotStart: TimeOnly;
  slotEnd: TimeOnly;
  orders: number;
  items: number;
  open: number;
  ready: number;
  collected: number;
}

export interface LowStockDto {
  productId: Guid;
  productName: string;
  date: DateOnly;
  remaining: number;
  maxSellable: number;
}

export interface DashboardDto {
  locationId: Guid | null;
  today: DateOnly;
  tomorrow: DateOnly;
  reservationsToday: number;
  reservationsTomorrow: number;
  reservedItemsToday: number;
  reservedItemsTomorrow: number;
  readyForPickup: number;
  preparing: number;
  awaitingAction: number;
  reservedValueToday: number;
  reservedValueTomorrow: number;
  currency: string;
  cancelledToday: number;
  lowStock: LowStockDto[];
  todaySchedule: DashboardSlotDto[];
  recentOrders: OrderListItemDto[];
  unreadNotifications: number;
}

// ---------- Errors (problem+json) ----------

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  traceId?: string;
  /** insufficient_stock */
  productId?: Guid;
  remaining?: number;
  /** product_unavailable / product_not_available_on_date */
  productIds?: Guid[];
  /** status conflicts */
  currentStatus?: OrderStatus;
  [key: string]: unknown;
}
