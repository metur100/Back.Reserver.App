import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Permission } from '@/api/types';
import { ForbiddenPage } from '@/components/common/pages';
import { Skeleton } from '@/components/ui/surface';
import { useAdmin } from '@/features/admin/AdminContext';
import { t } from '@/i18n';
import { useAuth } from './AuthProvider';

export function FullPageLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label={t('app.loading')}>
      <div className="w-64 space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/** Restores the session silently (refresh cookie) and redirects anonymous users to the login page. */
export function RequireAuth({ children, platform }: { children: ReactNode; platform?: boolean }) {
  const { status, me, ensureSession } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === 'idle') void ensureSession();
  }, [status, ensureSession]);

  if (status === 'idle' || status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous' || !me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (platform && !me.isPlatformAdmin) return <ForbiddenPage />;
  return <>{children}</>;
}

/** Shows the permission-denied page when the current membership lacks all of the given permissions. */
export function RequirePermission({ any, children }: { any: Permission[]; children: ReactNode }) {
  const { can } = useAdmin();
  if (!any.some(can)) return <ForbiddenPage />;
  return <>{children}</>;
}
