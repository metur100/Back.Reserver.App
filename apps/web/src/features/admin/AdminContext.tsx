import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { adminApi } from '@/api/endpoints';
import type { LocationDto, MembershipDto, Permission } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { hasPermission } from '@/auth/permissions';
import { safeStorage } from '@/lib/storage';

interface AdminContextValue {
  tenantId: string;
  membership: MembershipDto;
  can: (permission: Permission) => boolean;
  isOwner: boolean;
  isReadOnly: boolean;
  locations: LocationDto[];
  locationsLoading: boolean;
  /** '' = all locations (owners only). */
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
  /** A concrete location for pages that need one (falls back to the first accessible location). */
  effectiveLocationId: string | undefined;
  /** Prefix for TanStack Query keys, isolates caches per tenant. */
  key: (...parts: unknown[]) => unknown[];
}

const AdminCtx = createContext<AdminContextValue | null>(null);

export function AdminProvider({ membership, children }: { membership: MembershipDto; children: ReactNode }) {
  const tenantId = membership.tenantId;
  const can = useCallback((p: Permission) => hasPermission(membership, p), [membership]);
  const isOwner = membership.role === 'Owner';
  const storageKey = `br.location.${tenantId}`;
  const [selected, setSelected] = useState(() => safeStorage.get(storageKey) ?? '');

  const locationsQ = useQuery({
    queryKey: ['admin', tenantId, 'locations'],
    queryFn: adminApi.locations,
    enabled: can('OrdersView'),
    staleTime: 60_000,
  });
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const validSelected = locations.some((l) => l.id === selected) ? selected : isOwner ? '' : (locations[0]?.id ?? '');
  const setSelectedLocationId = useCallback(
    (id: string) => {
      safeStorage.set(storageKey, id);
      setSelected(id);
    },
    [storageKey],
  );

  const value = useMemo<AdminContextValue>(
    () => ({
      tenantId,
      membership,
      can,
      isOwner,
      isReadOnly: membership.tenantStatus === 'Suspended',
      locations,
      locationsLoading: locationsQ.isPending && can('OrdersView'),
      selectedLocationId: validSelected,
      setSelectedLocationId,
      effectiveLocationId: validSelected || locations[0]?.id,
      key: (...parts: unknown[]) => ['admin', tenantId, ...parts],
    }),
    [tenantId, membership, can, isOwner, locations, locationsQ.isPending, validSelected, setSelectedLocationId],
  );

  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdmin must be used inside <AdminProvider>');
  return ctx;
}

/** Convenience: current membership from auth (for components outside the provider). */
export function useCurrentMembership() {
  return useAuth().membership;
}
