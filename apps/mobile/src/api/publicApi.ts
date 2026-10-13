import { httpRequest, type FetchFn } from './http';
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  PickupSlotListDto,
  PublicAvailableDateDto,
  PublicBakeryDto,
  PublicOrderDto,
  PublicProductListDto,
} from './types';

export const ORDER_TOKEN_HEADER = 'X-Order-Token';

/** Public (customer) endpoints. No account needed; order access is granted by the capability token. */
export function createPublicApi(baseUrl: () => string, fetchFn?: FetchFn) {
  const get = <T>(path: string, query?: Record<string, string | readonly string[] | undefined>, headers?: Record<string, string>) =>
    httpRequest<T>(baseUrl(), path, { query, headers }, fetchFn);

  return {
    getBakery: (slug: string) => get<PublicBakeryDto>(`/api/v1/public/bakeries/${encodeURIComponent(slug)}`),

    getAvailability: (slug: string, locationId: string) =>
      get<PublicAvailableDateDto[]>(`/api/v1/public/bakeries/${encodeURIComponent(slug)}/availability`, { locationId }),

    getProducts: (slug: string, locationId: string, date: string) =>
      get<PublicProductListDto>(`/api/v1/public/bakeries/${encodeURIComponent(slug)}/products`, { locationId, date }),

    getPickupSlots: (locationId: string, date: string, productIds: readonly string[]) =>
      get<PickupSlotListDto>(`/api/v1/public/locations/${encodeURIComponent(locationId)}/pickup-slots`, { date, productIds }),

    /** The idempotency key must be generated once per submission and reused for retries of the same request. */
    createOrder: (request: CreateOrderRequest, idempotencyKey: string) =>
      httpRequest<CreateOrderResponse>(
        baseUrl(),
        '/api/v1/public/orders',
        { method: 'POST', body: request, headers: { 'Idempotency-Key': idempotencyKey }, timeoutMs: 25_000 },
        fetchFn,
      ),

    getOrder: (reference: string, token: string) =>
      get<PublicOrderDto>(`/api/v1/public/orders/${encodeURIComponent(reference)}`, undefined, { [ORDER_TOKEN_HEADER]: token }),

    cancelOrder: (reference: string, token: string) =>
      httpRequest<PublicOrderDto>(
        baseUrl(),
        `/api/v1/public/orders/${encodeURIComponent(reference)}/cancel`,
        { method: 'POST', headers: { [ORDER_TOKEN_HEADER]: token } },
        fetchFn,
      ),
  };
}

export type PublicApi = ReturnType<typeof createPublicApi>;
