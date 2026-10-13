import type { OrderQuery } from './types';

export const queryKeys = {
  bakery: (slug: string) => ['bakery', slug] as const,
  availability: (slug: string, locationId: string) => ['availability', slug, locationId] as const,
  products: (slug: string, locationId: string, date: string) => ['products', slug, locationId, date] as const,
  slots: (locationId: string, date: string, productIds: readonly string[]) =>
    ['slots', locationId, date, [...productIds].sort().join(',')] as const,
  publicOrder: (reference: string) => ['publicOrder', reference] as const,
  staff: {
    all: ['staff'] as const,
    orders: (tenantId: string, query: OrderQuery) => ['staff', tenantId, 'orders', query] as const,
    order: (tenantId: string, id: string) => ['staff', tenantId, 'order', id] as const,
    locations: (tenantId: string) => ['staff', tenantId, 'locations'] as const,
  },
};
