import { request, newIdempotencyKey } from './client';
import type * as T from './types';

const pub = '/api/v1/public';
const adm = '/api/v1/admin';
const authBase = '/api/v1/auth';

// ---------- Public ----------

export const publicApi = {
  bakery: (slug: string, signal?: AbortSignal) => request<T.PublicBakeryDto>(`${pub}/bakeries/${encodeURIComponent(slug)}`, { signal }),
  availability: (slug: string, locationId: string, signal?: AbortSignal) =>
    request<T.PublicAvailableDateDto[]>(`${pub}/bakeries/${encodeURIComponent(slug)}/availability`, { query: { locationId }, signal }),
  products: (slug: string, locationId: string, date: string, signal?: AbortSignal) =>
    request<T.PublicProductListDto>(`${pub}/bakeries/${encodeURIComponent(slug)}/products`, { query: { locationId, date }, signal }),
  pickupSlots: (locationId: string, date: string, productIds: string[], signal?: AbortSignal) =>
    request<T.PickupSlotListDto>(`${pub}/locations/${locationId}/pickup-slots`, { query: { date, productIds }, signal }),
  createOrder: (body: T.CreateOrderRequest, idempotencyKey: string = newIdempotencyKey()) =>
    request<T.CreateOrderResponse>(`${pub}/orders`, { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
  order: (reference: string, token: string, signal?: AbortSignal) =>
    request<T.PublicOrderDto>(`${pub}/orders/${encodeURIComponent(reference)}`, { headers: { 'X-Order-Token': token }, signal }),
  cancelOrder: (reference: string, token: string) =>
    request<T.PublicOrderDto>(`${pub}/orders/${encodeURIComponent(reference)}/cancel`, { method: 'POST', headers: { 'X-Order-Token': token } }),
};

// ---------- Auth ----------

export const authApi = {
  login: (body: T.LoginRequest) => request<T.AuthResponse>(`${authBase}/login`, { method: 'POST', body, credentials: 'include' }),
  logout: () => request<void>(`${authBase}/logout`, { method: 'POST', body: {}, credentials: 'include' }),
  me: () => request<T.MeDto>(`${authBase}/me`, { auth: 'user' }),
  registerBakery: (body: T.RegisterBakeryRequest) => request<T.MessageResponse>(`${authBase}/register-bakery`, { method: 'POST', body }),
  confirmEmail: (body: T.ConfirmEmailRequest) => request<T.MessageResponse>(`${authBase}/confirm-email`, { method: 'POST', body }),
  forgotPassword: (body: T.ForgotPasswordRequest) => request<T.MessageResponse>(`${authBase}/forgot-password`, { method: 'POST', body }),
  resetPassword: (body: T.ResetPasswordRequest) => request<T.MessageResponse>(`${authBase}/reset-password`, { method: 'POST', body }),
  inspectInvitation: (token: string) => request<T.InvitationInfoDto>(`${authBase}/invitations/inspect`, { method: 'POST', body: { token } }),
  acceptInvitation: (body: T.AcceptInvitationRequest) =>
    request<T.AuthResponse>(`${authBase}/invitations/accept`, { method: 'POST', body, credentials: 'include' }),
};

// ---------- Admin (Bearer + X-Tenant-Id) ----------

const a = <R>(path: string, options: Parameters<typeof request>[1] = {}) => request<R>(`${adm}${path}`, { auth: 'tenant', ...options });

export const adminApi = {
  dashboard: (locationId?: string) => a<T.DashboardDto>('/dashboard', { query: { locationId } }),

  orders: (q: T.OrderQuery) => a<T.PagedResult<T.OrderListItemDto>>('/orders', { query: { ...q } }),
  order: (id: string) => a<T.OrderDetailDto>(`/orders/${id}`),
  lookup: (code: string) => a<T.OrderDetailDto>('/orders/lookup', { query: { code } }),
  orderAction: (id: string, action: Exclude<T.OrderAction, 'cancel'>) => a<T.OrderDetailDto>(`/orders/${id}/${action}`, { method: 'POST' }),
  cancelOrder: (id: string, reason: string) => a<T.OrderDetailDto>(`/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  reportProblem: (id: string, note: string) => a<T.OrderDetailDto>(`/orders/${id}/problem`, { method: 'POST', body: { note } satisfies T.ReportProblemRequest }),

  products: (q: T.ProductQuery) => a<T.PagedResult<T.ProductDto>>('/products', { query: { ...q } }),
  product: (id: string) => a<T.ProductDto>(`/products/${id}`),
  createProduct: (body: T.UpsertProductRequest) => a<T.ProductDto>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: T.UpsertProductRequest) => a<T.ProductDto>(`/products/${id}`, { method: 'PUT', body }),
  publishProduct: (id: string) => a<T.ProductStatusChangeResult>(`/products/${id}/publish`, { method: 'POST' }),
  unpublishProduct: (id: string) => a<T.ProductStatusChangeResult>(`/products/${id}/unpublish`, { method: 'POST' }),
  archiveProduct: (id: string) => a<T.ProductStatusChangeResult>(`/products/${id}/archive`, { method: 'POST' }),
  restoreProduct: (id: string) => a<T.ProductDto>(`/products/${id}/restore`, { method: 'POST' }),
  copyProduct: (id: string) => a<T.ProductDto>(`/products/${id}/copy`, { method: 'POST' }),

  categories: () => a<T.CategoryDto[]>('/categories'),
  createCategory: (body: T.UpsertCategoryRequest) => a<T.CategoryDto>('/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: T.UpsertCategoryRequest) => a<T.CategoryDto>(`/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id: string) => a<void>(`/categories/${id}`, { method: 'DELETE' }),

  production: (locationId: string, date: string) => a<T.ProductionOverviewDto>('/inventory', { query: { locationId, date } }),
  dailyInventory: (locationId: string, date: string) => a<T.DailyInventoryDto>('/inventory/daily', { query: { locationId, date } }),
  updateDailyInventory: (body: T.UpdateDailyInventoryRequest) => a<T.DailyInventoryDto>('/inventory/daily', { method: 'PUT', body }),
  copyDay: (body: T.CopyDayRequest) => a<T.CopyDayResult>('/inventory/copy-day', { method: 'POST', body }),
  applyDefaults: (body: T.ApplyDefaultsRequest) => a<T.CopyDayResult>('/inventory/apply-defaults', { method: 'POST', body }),

  locations: () => a<T.LocationDto[]>('/locations'),
  location: (id: string) => a<T.LocationDto>(`/locations/${id}`),
  createLocation: (body: T.UpsertLocationRequest) => a<T.LocationDto>('/locations', { method: 'POST', body }),
  updateLocation: (id: string, body: T.UpsertLocationRequest) => a<T.LocationDto>(`/locations/${id}`, { method: 'PUT', body }),
  updateLocationSettings: (id: string, body: T.LocationSettingsDto) => a<T.LocationDto>(`/locations/${id}/settings`, { method: 'PUT', body }),
  addClosure: (id: string, body: T.AddClosureRequest) => a<T.LocationDto>(`/locations/${id}/closures`, { method: 'POST', body }),
  removeClosure: (id: string, closureId: string) => a<T.LocationDto>(`/locations/${id}/closures/${closureId}`, { method: 'DELETE' }),
  updateSchedule: (body: T.UpdateScheduleRequest) => a<T.LocationDto>('/pickup-schedules', { method: 'PUT', body }),

  staff: () => a<T.StaffOverviewDto>('/staff'),
  invite: (body: T.InviteStaffRequest) => a<T.InvitationDto>('/staff/invite', { method: 'POST', body }),
  revokeInvitation: (id: string) => a<void>(`/staff/invitations/${id}`, { method: 'DELETE' }),
  updateMembership: (membershipId: string, body: T.UpdateMembershipRequest) =>
    a<T.StaffOverviewDto>(`/staff/${membershipId}`, { method: 'PUT', body }),

  reportSummary: (q: T.ReportQuery) => a<T.ReportSummaryDto>('/reports/summary', { query: { ...q } }),
  reportExport: (type: T.ReportExportType, q: T.ReportQuery) => a<Response>(`/reports/${type}/export`, { query: { ...q }, raw: true }),

  settings: () => a<T.TenantSettingsDto>('/settings'),
  updateSettings: (body: T.UpdateTenantSettingsRequest) => a<T.TenantSettingsDto>('/settings', { method: 'PUT', body }),

  subscription: () => a<T.SubscriptionDto>('/subscription'),
  plans: () => a<T.SubscriptionPlanDto[]>('/subscription/plans'),
  changePlan: (planCode: string) => a<T.SubscriptionDto>('/subscription/change-plan', { method: 'POST', body: { planCode } }),

  notifications: (unreadOnly = false) => a<T.NotificationDto[]>('/notifications', { query: { unreadOnly } }),
  readAllNotifications: () => a<void>('/notifications/read-all', { method: 'POST' }),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return a<T.UploadResult>('/uploads/images', { method: 'POST', formData });
  },
};

// ---------- Platform ----------

const plat = '/api/v1/platform';
export const platformApi = {
  tenants: (search: string | undefined, page: number, pageSize = 25) =>
    request<T.PagedResult<T.PlatformTenantDto>>(`${plat}/tenants`, { auth: 'user', query: { search, page, pageSize } }),
  suspend: (id: string, reason: string | null) => request<void>(`${plat}/tenants/${id}/suspend`, { auth: 'user', method: 'POST', body: { reason } }),
  reactivate: (id: string, reason: string | null) =>
    request<void>(`${plat}/tenants/${id}/reactivate`, { auth: 'user', method: 'POST', body: { reason } }),
  health: () => request<T.PlatformHealthDto>(`${plat}/health`, { auth: 'user' }),
};
