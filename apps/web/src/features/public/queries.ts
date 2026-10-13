import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { publicApi } from '@/api/endpoints';

export const publicKeys = {
  bakery: (slug: string) => ['public', 'bakery', slug] as const,
  availability: (slug: string, locationId: string) => ['public', 'availability', slug, locationId] as const,
  products: (slug: string, locationId: string, date: string) => ['public', 'products', slug, locationId, date] as const,
  slots: (locationId: string, date: string, productIds: string[]) => ['public', 'slots', locationId, date, [...productIds].sort().join(',')] as const,
  order: (reference: string) => ['public', 'order', reference] as const,
};

export function useBakery(slug: string) {
  return useQuery({
    queryKey: publicKeys.bakery(slug),
    queryFn: ({ signal }) => publicApi.bakery(slug, signal),
    staleTime: 60_000,
  });
}

export function useAvailability(slug: string, locationId: string | undefined) {
  return useQuery({
    queryKey: publicKeys.availability(slug, locationId ?? ''),
    queryFn: ({ signal }) => publicApi.availability(slug, locationId!, signal),
    enabled: !!locationId,
    staleTime: 60_000,
  });
}

export function useProducts(slug: string, locationId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: publicKeys.products(slug, locationId ?? '', date ?? ''),
    queryFn: ({ signal }) => publicApi.products(slug, locationId!, date!, signal),
    enabled: !!locationId && !!date,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function usePickupSlots(locationId: string | undefined, date: string | undefined, productIds: string[], enabled = true) {
  return useQuery({
    queryKey: publicKeys.slots(locationId ?? '', date ?? '', productIds),
    queryFn: ({ signal }) => publicApi.pickupSlots(locationId!, date!, productIds, signal),
    enabled: enabled && !!locationId && !!date,
    staleTime: 15_000,
  });
}
