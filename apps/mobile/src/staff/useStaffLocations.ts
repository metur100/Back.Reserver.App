import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth/AuthContext';

/** Locations the signed-in staff member may see (server filters by membership). */
export function useStaffLocations() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: queryKeys.staff.locations(tenantId ?? ''),
    queryFn: () => adminApi.locations(),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
}
