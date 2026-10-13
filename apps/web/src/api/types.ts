/**
 * TypeScript mirrors of the BackReserve API contracts (backend/BackReserve.Application/Contracts/*.cs).
 * JSON is camelCase; enums are PascalCase strings; DateOnly = "yyyy-MM-dd"; TimeOnly = "HH:mm";
 * DateTimeOffset = ISO-8601; decimal = JSON number.
 */

export type IsoDate = string; // yyyy-MM-dd
export type IsoTime = string; // HH:mm
export type IsoDateTime = string; // ISO-8601 with offset
export type Guid = string;

// ---------- Enums ----------

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type TenantStatus = 'Active' | 'Suspended';
export type SubscriptionStatus = 'Trial' | 'Active' | 'PastDue' | 'Cancelled' | 'Suspended';
export type MembershipRole = 'Owner' | 'Manager' | 'Staff';
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
export type OrderStatus = 'Confirmed' | 'Preparing' | 'ReadyForPickup' | 'Collected' | 'Cancelled' | 'NoShow';
export type PaymentMode = 'PayAtPickup';
export type NotificationType = 'NewOrder' | 'OrderCancelledByCustomer' | 'PickupProblem';
export type AvailabilityStatus = 'Available' | 'Low' | 'SoldOut';
/** Status codes from LocationSchedule.StatusCode */
export type DateStatus =
  | 'open'
  | 'past'
  | 'too_far_ahead'
  | 'closed'
  | 'no_pickup'
  | 'cutoff_passed'
  | 'not_accepting_orders'
  | 'unavailable';
export type SlotUnavailableReason = 'too_soon' | 'full';
export type OrderAction = 'prepare' | 'ready' | 'collect' | 'cancel' | 'no-show';

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface MessageResponse {
  message: string;
}

// ---------- Public ----------

export interface OpeningHoursDto {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  opensAt: IsoTime | null;
  closesAt: IsoTime | null;
  pickupStart: IsoTime;
  pickupEnd: IsoTime;
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
  orderCutoffTime: IsoTime;
  cancellationCutoffDaysBefore: number;
  cancellationCutoffTime: IsoTime;
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
  date: IsoDate;
  isOrderable: boolean;
  status: DateStatus;
  orderCutoffAt: IsoDateTime | null;
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
  date: IsoDate;
  dateIsOrderable: boolean;
  dateStatus: DateStatus;
  products: PublicProductDto[];
}

export interface PickupSlotDto {
  start: IsoTime;
  end: IsoTime;
  startUtc: IsoDateTime;
  available: boolean;
  remainingOrders: number;
  unavailableReason: SlotUnavailableReason | null;
}

export interface PickupSlotListDto {
  locationId: Guid;
  date: IsoDate;
  dateIsOrderable: boolean;
  dateStatus: DateStatus;
  slots: PickupSlotDto[];
}

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

export interface CreateOrderRequest {
  locationId: Guid;
  pickupDate: IsoDate;
  slotStart: IsoTime;
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
  pickupDate: IsoDate;
  slotStart: IsoTime;
  slotEnd: IsoTime;
  items: PublicOrderItemDto[];
  subtotal: number;
  total: number;
  currency: string;
  paymentMode: PaymentMode;
  customerFirstName: string;
  customerNote: string | null;
  createdAt: IsoDateTime;
  canCancel: boolean;
  cancellationDeadline: IsoDateTime;
  cancelledAt: IsoDateTime | null;
  pickupInstructions: string | null;
  cancellationPolicyText: string | null;
}

export interface CreateOrderResponse {
  order: PublicOrderDto;
  accessToken: string;
}

// ---------- Auth ----------

export interface RegisterBakeryRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  bakeryName: string;
  slug: string | null;
  acceptTerms: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ConfirmEmailRequest {
  userId: Guid;
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}

export interface AcceptInvitationRequest {
  token: string;
  firstName: string | null;
  lastName: string | null;
  password: string;
}

export interface InvitationInfoDto {
  bakeryName: string;
  email: string;
  role: MembershipRole;
  expiresAt: IsoDateTime;
  accountExists: boolean;
}

export interface MembershipDto {
  tenantId: Guid;
  tenantName: string;
  tenantSlug: string;
  role: MembershipRole;
  permissions: Permission[];
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
  accessTokenExpiresAt: IsoDateTime;
  refreshToken: string | null;
  user: MeDto;
}

// ---------- Admin: orders ----------

export interface OrderQuery {
  locationId?: Guid;
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  status?: OrderStatus[];
  slotStart?: IsoTime;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderListItemDto {
  id: Guid;
  publicReference: string;
  locationId: Guid;
  locationName: string;
  pickupDate: IsoDate;
  slotStart: IsoTime;
  slotEnd: IsoTime;
  status: OrderStatus;
  customerName: string;
  itemCount: number;
  total: number;
  currency: string;
  hasNote: boolean;
  createdAt: IsoDateTime;
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
  createdAt: IsoDateTime;
}

export interface OrderDetailDto {
  id: Guid;
  publicReference: string;
  locationId: Guid;
  locationName: string;
  pickupDate: IsoDate;
  slotStart: IsoTime;
  slotEnd: IsoTime;
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
  createdAt: IsoDateTime;
  collectedAt: IsoDateTime | null;
  cancelledAt: IsoDateTime | null;
  cancellationReason: string | null;
  history: OrderHistoryDto[];
  allowedActions: OrderAction[];
}

export interface OrderActionRequest {
  reason: string | null;
}

/** POST /admin/orders/{id}/problem — recorded in history (fromStatus === toStatus) without a status change. */
export interface ReportProblemRequest {
  note: string;
}

// ---------- Admin: products ----------

export interface CategoryDto {
  id: Guid;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface UpsertCategoryRequest {
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export type ProductStatusFilter = 'published' | 'draft' | 'archived' | 'all';

export interface ProductQuery {
  categoryId?: Guid;
  status?: ProductStatusFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductDto {
  id: Guid;
  name: string;
  slug: string;
  description: string | null;
  categoryId: Guid | null;
  categoryName: string | null;
  basePrice: number;
  currency: string;
  imageUrl: string | null;
  isPublished: boolean;
  isArchived: boolean;
  allergens: string | null;
  ingredients: string | null;
  dietaryLabels: string[];
  leadTimeHours: number;
  defaultDailyQuantity: number | null;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface UpsertProductRequest {
  name: string;
  description: string | null;
  categoryId: Guid | null;
  basePrice: number;
  imageUrl: string | null;
  allergens: string | null;
  ingredients: string | null;
  dietaryLabels: string[] | null;
  leadTimeHours: number;
  defaultDailyQuantity: number | null;
  sortOrder: number;
}

export interface ProductStatusChangeResult {
  product: ProductDto;
  activeReservations: number;
  message: string | null;
}

// ---------- Admin: inventory ----------

export interface DailyInventoryRowDto {
  inventoryId: Guid | null;
  productId: Guid;
  productName: string;
  categoryName: string | null;
  isPublished: boolean;
  plannedQuantity: number;
  safetyBuffer: number;
  reservedQuantity: number;
  collectedQuantity: number;
  noShowQuantity: number;
  maxSellable: number;
  remaining: number;
  isUnavailable: boolean;
  isLowStock: boolean;
}

export interface DailyInventoryDto {
  locationId: Guid;
  date: IsoDate;
  rows: DailyInventoryRowDto[];
}

export interface DailyInventoryItemRequest {
  productId: Guid;
  plannedQuantity: number;
  safetyBuffer: number;
  isUnavailable: boolean;
}

export interface UpdateDailyInventoryRequest {
  locationId: Guid;
  date: IsoDate;
  items: DailyInventoryItemRequest[];
}

export interface CopyDayRequest {
  locationId: Guid;
  sourceDate: IsoDate;
  targetDate: IsoDate;
  overwrite: boolean;
}

export interface ApplyDefaultsRequest {
  locationId: Guid;
  date: IsoDate;
  overwrite: boolean;
}

export interface CopyDayResult {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface ProductionSlotQuantityDto {
  slotStart: IsoTime;
  quantity: number;
}

export interface ProductionProductDto {
  productId: Guid;
  productName: string;
  plannedQuantity: number;
  safetyBuffer: number;
  reservedQuantity: number;
  collectedQuantity: number;
  remaining: number;
  isUnavailable: boolean;
  isLowStock: boolean;
  bySlot: ProductionSlotQuantityDto[];
}

export interface ProductionSlotDto {
  slotStart: IsoTime;
  slotEnd: IsoTime;
  orderCount: number;
  itemCount: number;
  maxOrders: number | null;
}

export interface ProductionOverviewDto {
  locationId: Guid;
  date: IsoDate;
  products: ProductionProductDto[];
  slots: ProductionSlotDto[];
}

/** Extension payload of a 409 quantity_below_reservations problem. */
export interface QuantityViolation {
  productId: Guid;
  productName: string;
  committed: number;
  requested: number;
}

// ---------- Admin: locations ----------

export interface LocationSettingsDto {
  timeZoneId: string;
  acceptsOrders: boolean;
  orderCutoffDaysBefore: number;
  orderCutoffTime: IsoTime;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
  cancellationCutoffDaysBefore: number;
  cancellationCutoffTime: IsoTime;
}

export interface ScheduleRuleDto {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  opensAt: IsoTime | null;
  closesAt: IsoTime | null;
  pickupStart: IsoTime;
  pickupEnd: IsoTime;
  slotMinutes: number;
  maxOrdersPerSlot: number;
  maxItemsPerSlot: number | null;
}

export interface ClosureDto {
  id: Guid;
  date: IsoDate;
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

export interface UpsertLocationRequest {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  settings: LocationSettingsDto;
}

export interface UpdateScheduleRequest {
  locationId: Guid;
  rules: ScheduleRuleDto[];
}

export interface AddClosureRequest {
  date: IsoDate;
  reason: string | null;
}

// ---------- Admin: staff ----------

export interface StaffMemberDto {
  membershipId: Guid;
  userId: Guid;
  firstName: string;
  lastName: string;
  email: string;
  role: MembershipRole;
  permissions: Permission[];
  locationIds: Guid[] | null;
  isActive: boolean;
  isCurrentUser: boolean;
}

export interface InvitationDto {
  id: Guid;
  email: string;
  role: MembershipRole;
  locationIds: Guid[];
  expiresAt: IsoDateTime;
  status: 'pending' | 'expired' | string;
  createdAt: IsoDateTime;
}

export interface StaffOverviewDto {
  members: StaffMemberDto[];
  invitations: InvitationDto[];
  maxStaff: number;
}

export interface InviteStaffRequest {
  email: string;
  role: MembershipRole;
  locationIds: Guid[];
  permissions: Permission[] | null;
}

export interface UpdateMembershipRequest {
  role: MembershipRole;
  locationIds: Guid[];
  permissions: Permission[] | null;
  isActive: boolean;
}

// ---------- Admin: settings ----------

export interface TenantSettingsDto {
  tenantId: Guid;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  brandColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  isPublished: boolean;
  requireCustomerLastName: boolean;
  requireCustomerPhone: boolean;
  sendReadyNotification: boolean;
  sendPickupReminder: boolean;
  pickupReminderHoursBefore: number;
  pickupInstructions: string | null;
  cancellationPolicyText: string | null;
  allergenDisclaimer: string | null;
  customerDataRetentionDays: number;
}

export type UpdateTenantSettingsRequest = Omit<TenantSettingsDto, 'tenantId' | 'slug'>;

// ---------- Admin: subscription ----------

export interface SubscriptionPlanDto {
  id: Guid;
  code: string;
  name: string;
  monthlyPrice: number;
  currency: string;
  maxLocations: number;
  maxProducts: number;
  maxStaff: number;
  productionPlanning: boolean;
  csvExport: boolean;
  customBranding: boolean;
  emailNotifications: boolean;
}

export interface SubscriptionDto {
  plan: SubscriptionPlanDto;
  status: SubscriptionStatus;
  trialEndsAt: IsoDateTime | null;
  currentPeriodEndsAt: IsoDateTime | null;
  billingProvider: string;
  billingConfigured: boolean;
  locationsUsed: number;
  productsUsed: number;
  staffUsed: number;
}

export interface ChangePlanRequest {
  planCode: string;
}

// ---------- Admin: dashboard ----------

export interface DashboardSlotDto {
  slotStart: IsoTime;
  slotEnd: IsoTime;
  orders: number;
  items: number;
  open: number;
  ready: number;
  collected: number;
}

export interface LowStockDto {
  productId: Guid;
  productName: string;
  date: IsoDate;
  remaining: number;
  maxSellable: number;
}

export interface DashboardDto {
  locationId: Guid | null;
  today: IsoDate;
  tomorrow: IsoDate;
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

// ---------- Admin: reports ----------

export interface ReportQuery {
  locationId?: Guid;
  from: IsoDate;
  to: IsoDate;
}

export interface OrdersByDayDto {
  date: IsoDate;
  orders: number;
  items: number;
  reservedValue: number;
  collected: number;
  cancelled: number;
  noShow: number;
}

export interface ProductReportDto {
  productId: Guid;
  productName: string;
  quantity: number;
  reservedValue: number;
  orders: number;
}

export interface SlotReportDto {
  slotStart: IsoTime;
  orders: number;
  items: number;
}

export interface ReportSummaryDto {
  from: IsoDate;
  to: IsoDate;
  orders: number;
  items: number;
  reservedValue: number;
  cancelled: number;
  noShow: number;
  collected: number;
  currency: string;
  byDay: OrdersByDayDto[];
  byProduct: ProductReportDto[];
  bySlot: SlotReportDto[];
}

export type ReportExportType = 'orders' | 'products' | 'slots';

// ---------- Notifications ----------

export interface NotificationDto {
  id: Guid;
  type: NotificationType;
  orderId: Guid | null;
  message: string;
  createdAt: IsoDateTime;
  isRead: boolean;
}

export interface UploadResult {
  url: string;
}

// ---------- Platform ----------

export interface PlatformTenantDto {
  id: Guid;
  name: string;
  slug: string;
  status: TenantStatus;
  isPublished: boolean;
  planCode: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  locations: number;
  createdAt: IsoDateTime;
}

export interface PlatformHealthDto {
  tenants: number;
  activeTenants: number;
  pendingOutbox: number;
  failedOutbox: number;
  oldestPendingOutbox: IsoDateTime | null;
}

export interface TenantStatusRequest {
  reason: string | null;
}

// ---------- Dev ----------

export interface DevMailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  category: string;
  sentAt: IsoDateTime;
}

// ---------- Errors ----------

/** RFC 7807 problem details as produced by ApiExceptionHandler. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  traceId?: string;
  [extension: string]: unknown;
}
