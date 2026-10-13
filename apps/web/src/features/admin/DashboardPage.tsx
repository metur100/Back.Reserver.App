import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Ban, CalendarDays, ChefHat, CircleCheck, CircleDashed, Euro, Inbox, Package, PackageCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { adminApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { OrderStatusBadge } from '@/components/common/status';
import { CardsSkeleton, ErrorState, ListSkeleton, PageHeader, UpdatedAgo } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { t } from '@/i18n';
import { formatDateLong, formatDateShort, formatNumber, formatTimeRange } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import { useAdmin } from './AdminContext';

function Kpi({ label, value, hint, icon, tone = 'neutral' }: { label: string; value: ReactNode; hint?: string; icon: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const toneClass = {
    neutral: 'bg-surface-muted text-muted-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  }[tone];
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', toneClass)} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  useDocumentTitle(t('admin.dashboard.title'));
  const { me } = useAuth();
  const { key, selectedLocationId, locations, locationsLoading, can } = useAdmin();
  const dashboardQ = useQuery({
    queryKey: key('dashboard', selectedLocationId),
    queryFn: () => adminApi.dashboard(selectedLocationId || undefined),
    refetchInterval: 20_000,
  });
  const d = dashboardQ.data;

  return (
    <div>
      <PageHeader
        title={t('admin.dashboard.greeting', { name: me?.firstName ?? '' })}
        description={
          d ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {t('admin.dashboard.todayIs', { date: formatDateLong(d.today, true) })}
              <UpdatedAgo updatedAt={dashboardQ.dataUpdatedAt} fetching={dashboardQ.isFetching} />
            </span>
          ) : undefined
        }
      />

      {!locationsLoading && locations.length === 0 && can('LocationsManage') && <SetupGuide />}

      {dashboardQ.isPending ? (
        <div className="space-y-4">
          <CardsSkeleton count={8} />
          <ListSkeleton rows={3} />
        </div>
      ) : dashboardQ.isError ? (
        <ErrorState error={dashboardQ.error} onRetry={() => void dashboardQ.refetch()} />
      ) : (
        <div className="space-y-6">
          <section aria-label={t('admin.dashboard.title')} className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Kpi label={t('admin.dashboard.reservationsToday')} value={formatNumber(d!.reservationsToday)} icon={<CalendarDays className="size-5" />} tone="info" />
            <Kpi label={t('admin.dashboard.reservationsTomorrow')} value={formatNumber(d!.reservationsTomorrow)} icon={<CalendarDays className="size-5" />} />
            <Kpi
              label={t('admin.dashboard.itemsToday')}
              value={formatNumber(d!.reservedItemsToday)}
              hint={`${t('admin.dashboard.itemsTomorrow')}: ${formatNumber(d!.reservedItemsTomorrow)}`}
              icon={<Package className="size-5" />}
            />
            <Kpi label={t('admin.dashboard.awaiting')} value={formatNumber(d!.awaitingAction)} hint={t('admin.dashboard.awaitingHint')} icon={<Inbox className="size-5" />} tone="info" />
            <Kpi label={t('admin.dashboard.preparing')} value={formatNumber(d!.preparing)} icon={<ChefHat className="size-5" />} tone="warning" />
            <Kpi label={t('admin.dashboard.ready')} value={formatNumber(d!.readyForPickup)} icon={<PackageCheck className="size-5" />} tone="success" />
            <Kpi
              label={t('admin.dashboard.valueToday')}
              value={formatMoney(d!.reservedValueToday, d!.currency)}
              hint={`${t('admin.dashboard.valueHint')} · ${t('admin.dashboard.valueTomorrow')}: ${formatMoney(d!.reservedValueTomorrow, d!.currency)}`}
              icon={<Euro className="size-5" />}
            />
            <Kpi label={t('admin.dashboard.cancelledToday')} value={formatNumber(d!.cancelledToday)} icon={<Ban className="size-5" />} tone="danger" />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.dashboard.schedule')}</CardTitle>
                <Button asChild variant="link" size="sm">
                  <Link to="/admin/bestellungen?ansicht=zeitfenster">{t('admin.dashboard.allOrders')}</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {d!.todaySchedule.length === 0 ? (
                  <p className="text-muted-foreground">{t('admin.dashboard.scheduleEmpty')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {d!.todaySchedule.map((s) => (
                      <li key={s.slotStart} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <Link to={`/admin/bestellungen?zeit=${s.slotStart}`} className="font-semibold tabular hover:underline">
                          {formatTimeRange(s.slotStart, s.slotEnd)}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span>{t('admin.dashboard.slotOrders', { count: s.orders })}</span>
                          <span className="text-muted-foreground">{t('admin.dashboard.slotItems', { count: s.items })}</span>
                          <span className="inline-flex items-center gap-1 text-info">
                            <CircleDashed className="size-3.5" aria-hidden="true" />
                            {t('admin.dashboard.slotOpen', { count: s.open })}
                          </span>
                          <span className="inline-flex items-center gap-1 text-success">
                            <PackageCheck className="size-3.5" aria-hidden="true" />
                            {t('admin.dashboard.slotReady', { count: s.ready })}
                          </span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CircleCheck className="size-3.5" aria-hidden="true" />
                            {t('admin.dashboard.slotCollected', { count: s.collected })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.dashboard.lowStock')}</CardTitle>
              </CardHeader>
              <CardContent>
                {d!.lowStock.length === 0 ? (
                  <p className="text-muted-foreground">{t('admin.dashboard.lowStockEmpty')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {d!.lowStock.map((l) => (
                      <li key={`${l.productId}-${l.date}`} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.productName}</span>
                          <span className="text-sm text-muted-foreground">{formatDateShort(l.date)}</span>
                        </span>
                        <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', l.remaining === 0 ? 'text-danger' : 'text-warning')}>
                          <AlertTriangle className="size-4" aria-hidden="true" />
                          {l.remaining === 0 ? t('admin.dashboard.soldOut') : t('admin.dashboard.lowStockItem', { remaining: l.remaining, max: l.maxSellable })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.dashboard.recent')}</CardTitle>
              <Button asChild variant="link" size="sm">
                <Link to="/admin/bestellungen">
                  {t('admin.dashboard.allOrders')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {d!.recentOrders.length === 0 ? (
                <p className="text-muted-foreground">{t('admin.dashboard.recentEmpty')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d!.recentOrders.map((o) => (
                    <li key={o.id}>
                      <Link to={`/admin/bestellungen/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-surface-muted/50">
                        <span className="min-w-0">
                          <span className="font-mono font-semibold tracking-wider">{o.publicReference}</span>{' '}
                          <span className="text-[0.95rem]">· {o.customerName}</span>
                          <span className="block text-sm text-muted-foreground tabular">
                            {formatDateShort(o.pickupDate)}, {formatTimeRange(o.slotStart, o.slotEnd)} · {formatMoney(o.total, o.currency)}
                          </span>
                        </span>
                        <OrderStatusBadge status={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SetupGuide() {
  const steps = [
    { to: '/admin/standorte', label: t('admin.dashboard.setupLocation') },
    { to: '/admin/produkte', label: t('admin.dashboard.setupProducts') },
    { to: '/admin/produktion', label: t('admin.dashboard.setupInventory') },
    { to: '/admin/einstellungen', label: t('admin.dashboard.setupPublish') },
  ];
  return (
    <Card className="mb-6 border-primary/30 bg-primary-soft/40 p-4 sm:p-5">
      <h2 className="font-semibold">{t('admin.dashboard.setupTitle')}</h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.to}>
            <Link to={s.to} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 hover:border-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">{i + 1}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
