import type { AuthSession } from './authSession';
import type { DashboardDto, LocationDto, OrderAction, OrderDetailDto, OrderListItemDto, OrderQuery, PagedResult } from './types';

export const TENANT_HEADER = 'X-Tenant-Id';

/** Staff endpoints under /api/v1/admin. Every call carries the bearer token and the selected tenant id. */
export function createAdminApi(session: AuthSession, tenantId: () => string | null) {
  const headers = (): Record<string, string> => {
    const id = tenantId();
    return id ? { [TENANT_HEADER]: id } : {};
  };

  return {
    listOrders: (query: OrderQuery) =>
      session.request<PagedResult<OrderListItemDto>>('/api/v1/admin/orders', {
        headers: headers(),
        query: {
          locationId: query.locationId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          status: query.status,
          slotStart: query.slotStart,
          search: query.search?.trim() || undefined,
          page: query.page,
          pageSize: query.pageSize,
        },
      }),

    getOrder: (id: string) => session.request<OrderDetailDto>(`/api/v1/admin/orders/${encodeURIComponent(id)}`, { headers: headers() }),

    lookup: (code: string) => session.request<OrderDetailDto>('/api/v1/admin/orders/lookup', { headers: headers(), query: { code } }),

    action: (id: string, action: OrderAction, reason?: string | null) =>
      session.request<OrderDetailDto>(`/api/v1/admin/orders/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: headers(),
        body: action === 'cancel' ? { reason: reason ?? null } : undefined,
      }),

    /** Records a pickup problem in the order history without changing the status (PickupCollect or OrdersProcess). */
    reportProblem: (id: string, note: string) =>
      session.request<OrderDetailDto>(`/api/v1/admin/orders/${encodeURIComponent(id)}/problem`, {
        method: 'POST',
        headers: headers(),
        body: { note },
      }),

    dashboard: (locationId?: string | null) =>
      session.request<DashboardDto>('/api/v1/admin/dashboard', { headers: headers(), query: { locationId: locationId ?? undefined } }),

    locations: () => session.request<LocationDto[]>('/api/v1/admin/locations', { headers: headers() }),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
