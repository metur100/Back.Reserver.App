import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { PublicProductDto } from '@/api/types';

export function renderWithProviders(ui: ReactElement, options?: RenderOptions & { route?: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options?.route ?? '/']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export function product(overrides: Partial<PublicProductDto> = {}): PublicProductDto {
  return {
    id: 'p1',
    name: 'Classic Donut',
    slug: 'classic-donut',
    description: 'Fluffiger Hefeteig',
    categoryId: 'c1',
    price: 1.9,
    currency: 'EUR',
    imageUrl: null,
    allergens: 'Weizen (Gluten), Ei',
    ingredients: null,
    dietaryLabels: [],
    leadTimeHours: 0,
    remaining: 10,
    availability: 'Available',
    ...overrides,
  };
}

/** Normalises non-breaking spaces produced by Intl for easier assertions. */
export const nbsp = (s: string) => s.replaceAll(String.fromCharCode(0xa0), ' ').replaceAll(String.fromCharCode(0x202f), ' ');
