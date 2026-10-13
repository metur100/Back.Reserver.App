import { useEffect, useState, type ReactNode } from 'react';
import { CloudOff, Inbox, Lock, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { isApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/surface';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground" aria-hidden="true">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description && <p className="text-[0.95rem] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: ReactNode;
  className?: string;
  compact?: boolean;
}

/** Error display with retry; distinguishes network, permission and plan errors. */
export function ErrorState({ error, onRetry, title, className, compact }: ErrorStateProps) {
  const api = isApiError(error) ? error : null;
  const isNetwork = api?.isNetwork;
  const isForbidden = api?.isForbidden && !api.isPlanFeature;
  const Icon = isNetwork ? CloudOff : isForbidden ? Lock : api?.isPlanFeature ? Sparkles : TriangleAlert;
  const heading = title ?? (isForbidden ? t('pages.forbiddenTitle') : t('errors.loadFailed'));
  const message = api ? api.title : t('errors.unexpected');
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/20 bg-danger-soft/50 text-center',
        compact ? 'px-4 py-5' : 'px-6 py-10',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-surface text-danger" aria-hidden="true">
        <Icon className="size-5" />
      </div>
      <div className="max-w-md space-y-1">
        <p className="font-semibold">{heading}</p>
        <p className="text-[0.95rem] text-muted-foreground">{message}</p>
        {api?.isPlanFeature && <p className="text-sm text-muted-foreground">{t('errors.planFeatureHint')}</p>}
      </div>
      {onRetry && !isForbidden && !api?.isPlanFeature && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t('app.retry')}
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label={t('app.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
          <Skeleton className="size-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)} role="status" aria-label={t('app.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** "aktualisiert vor x s" for auto-refreshing operational data. */
export function UpdatedAgo({ updatedAt, fetching, className }: { updatedAt: number; fetching?: boolean; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);
  if (!updatedAt) return null;
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <RefreshCw className={cn('size-3.5', fetching && 'animate-spin')} aria-hidden="true" />
      {fetching ? t('app.updating') : seconds < 5 ? t('app.updatedJustNow') : t('app.updatedAgo', { seconds: String(seconds) })}
    </span>
  );
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
        {description && <div className="text-[0.95rem] text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('admin.orders.page')}>
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('app.previous')}
      </Button>
      <span className="text-sm text-muted-foreground">{t('app.pageOf', { page, pages })}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('app.next')}
      </Button>
    </nav>
  );
}
