import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, LayoutList, MessageSquare, Rows3, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminApi } from '@/api/endpoints';
import type { LocationDto, OrderAction, OrderListItemDto, OrderStatus } from '@/api/types';
import { OrderStatusBadge } from '@/components/common/status';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination, UpdatedAgo } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Input, Label, NativeSelect } from '@/components/ui/input';
import { Card } from '@/components/ui/surface';
import { t } from '@/i18n';
import { addDays, addMinutesToTime, dayOfWeekOf, formatDateShort, formatTimeRange, timeToMinutes, todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { actionsForStatus, orderActionShortLabel, ORDER_STATUSES, primaryAction } from '@/lib/orderStatus';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import { useAdmin } from '../AdminContext';
import { ActionIcon, useOrderAction } from './orderActions';

/** Slot start times configured for a date across the given locations (for the slot filter). */
export function slotOptions(locations: LocationDto[], date: string): string[] {
  const day = dayOfWeekOf(date);
  const starts = new Set<string>();
  for (const l of locations) {
    const rule = l.schedule.find((r) => r.dayOfWeek === day);
    if (!rule || !rule.isOpen || rule.slotMinutes <= 0) continue;
    for (let m = timeToMinutes(rule.pickupStart); m + rule.slotMinutes <= timeToMinutes(rule.pickupEnd); m += rule.slotMinutes) {
      starts.add(addMinutesToTime('00:00', m));
    }
  }
  return [...starts].sort();
}

function useOrderFilters() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const from = params.get('von') ?? today;
  const to = params.get('bis') ?? from;
  const statuses = (params.get('status')?.split(',').filter((s): s is OrderStatus => ORDER_STATUSES.includes(s as OrderStatus)) ?? []) as OrderStatus[];
  const slot = params.get('zeit') ?? '';
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('seite') ?? '1') || 1);
  const view = params.get('ansicht') === 'zeitfenster' ? 'slots' : 'table';
  const set = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !('seite' in patch)) next.delete('seite');
    setParams(next, { replace: true });
  };
  return { today, from, to, statuses, slot, search, page, view, set };
}

export default function OrdersPage() {
  useDocumentTitle(t('admin.orders.title'));
  const { key, selectedLocationId, locations, can } = useAdmin();
  const f = useOrderFilters();
  const [searchInput, setSearchInput] = useState(f.search);
  const isSingleDay = f.from === f.to;
  const pageSize = f.view === 'slots' ? 100 : 25;

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (searchInput !== f.search) f.set({ q: searchInput.trim() || null });
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = {
    locationId: selectedLocationId || undefined,
    dateFrom: f.from,
    dateTo: f.to,
    status: f.statuses.length ? f.statuses : undefined,
    slotStart: isSingleDay && f.slot ? f.slot : undefined,
    search: f.search || undefined,
    page: f.page,
    pageSize,
  };
  const ordersQ = useQuery({
    queryKey: key('orders', query),
    queryFn: () => adminApi.orders(query),
    refetchInterval: 20_000,
    placeholderData: keepPreviousData,
  });

  const scopedLocations = selectedLocationId ? locations.filter((l) => l.id === selectedLocationId) : locations;
  const slots = useMemo(() => (isSingleDay ? slotOptions(scopedLocations, f.from) : []), [isSingleDay, scopedLocations, f.from]);
  const hasFilters = f.statuses.length > 0 || !!f.slot || !!f.search || f.from !== f.today || f.to !== f.today;

  const toggleStatus = (s: OrderStatus) => {
    const next = f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s];
    f.set({ status: next.join(',') || null });
  };

  const data = ordersQ.data;

  return (
    <div>
      <PageHeader
        title={t('admin.orders.title')}
        description={data ? <UpdatedAgo updatedAt={ordersQ.dataUpdatedAt} fetching={ordersQ.isFetching} /> : undefined}
      />

      <Card className="mb-4 space-y-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t('admin.orders.date')}</span>
            <div className="flex flex-wrap gap-2">
              <Button variant={f.from === f.today && f.to === f.today ? 'primary' : 'outline'} aria-pressed={f.from === f.today && f.to === f.today} onClick={() => f.set({ von: null, bis: null })}>
                {t('admin.orders.today')}
              </Button>
              <Button
                variant={f.from === addDays(f.today, 1) && f.to === f.from ? 'primary' : 'outline'}
                aria-pressed={f.from === addDays(f.today, 1) && f.to === f.from}
                onClick={() => f.set({ von: addDays(f.today, 1), bis: addDays(f.today, 1) })}
              >
                {t('admin.orders.tomorrow')}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            <div className="space-y-1.5">
              <Label htmlFor="orders-from">{t('admin.orders.from')}</Label>
              <Input id="orders-from" type="date" value={f.from} onChange={(e) => e.target.value && f.set({ von: e.target.value, bis: e.target.value > f.to ? e.target.value : f.to })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orders-to">{t('admin.orders.to')}</Label>
              <Input id="orders-to" type="date" value={f.to} min={f.from} onChange={(e) => e.target.value && f.set({ bis: e.target.value })} />
            </div>
          </div>
          {isSingleDay && slots.length > 0 && (
            <div className="space-y-1.5 sm:w-48">
              <Label htmlFor="orders-slot">{t('admin.orders.slot')}</Label>
              <NativeSelect id="orders-slot" value={f.slot} onChange={(e) => f.set({ zeit: e.target.value || null })}>
                <option value="">{t('admin.orders.allSlots')}</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {s} Uhr
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="orders-search">{t('admin.orders.search')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="orders-search"
                type="search"
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={can('CustomerContactView') ? t('admin.orders.searchPlaceholder') : t('admin.orders.searchPlaceholderNoContact')}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('admin.orders.status')}>
          <span className="mr-1 text-sm font-medium">{t('admin.orders.status')}:</span>
          {ORDER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={f.statuses.includes(s)}
              onClick={() => toggleStatus(s)}
              className={cn(
                'min-h-10 rounded-full border px-3.5 text-sm font-medium transition-colors',
                f.statuses.includes(s) ? 'border-foreground bg-foreground text-background' : 'border-border-strong bg-surface hover:border-foreground',
              )}
            >
              {t(`status.${s}`)}
            </button>
          ))}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('');
                f.set({ von: null, bis: null, status: null, zeit: null, q: null });
              }}
            >
              <X aria-hidden="true" />
              {t('admin.orders.resetFilters')}
            </Button>
          )}
        </div>
      </Card>

      <Tabs value={f.view} onValueChange={(v) => f.set({ ansicht: v === 'slots' ? 'zeitfenster' : null })}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="table">
              <LayoutList aria-hidden="true" />
              {t('admin.orders.viewTable')}
            </TabsTrigger>
            <TabsTrigger value="slots">
              <Rows3 aria-hidden="true" />
              {t('admin.orders.viewSlots')}
            </TabsTrigger>
          </TabsList>
          {data && <p className="text-sm text-muted-foreground" aria-live="polite">{t('app.resultsCount', { count: data.totalCount })}</p>}
        </div>

        {ordersQ.isPending ? (
          <ListSkeleton className="mt-4" rows={5} />
        ) : ordersQ.isError ? (
          <ErrorState className="mt-4" error={ordersQ.error} onRetry={() => void ordersQ.refetch()} />
        ) : data!.items.length === 0 ? (
          <EmptyState className="mt-4" title={t('admin.orders.empty')} description={t('admin.orders.emptyHint')} />
        ) : (
          <>
            <TabsContent value="table">
              <OrdersTable orders={data!.items} showLocation={!selectedLocationId && locations.length > 1} showDate={!isSingleDay} />
              <OrdersCards orders={data!.items} showDate={!isSingleDay} />
              <Pagination page={data!.page} pageSize={data!.pageSize} total={data!.totalCount} onPage={(p) => f.set({ seite: String(p) }, false)} />
            </TabsContent>
            <TabsContent value="slots">
              <SlotGroups orders={data!.items} showDate={!isSingleDay} />
              <Pagination page={data!.page} pageSize={data!.pageSize} total={data!.totalCount} onPage={(p) => f.set({ seite: String(p) }, false)} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

/** One-tap primary action (prepare → ready → collect) for list items; collect asks for confirmation. */
function QuickAction({ order, size = 'md', block }: { order: OrderListItemDto; size?: 'md' | 'lg'; block?: boolean }) {
  const { can } = useAdmin();
  const run = useOrderAction();
  const allowed = actionsForStatus(order.status).filter((a) =>
    a === 'prepare' || a === 'ready' ? can('OrdersProcess') : a === 'collect' ? can('PickupCollect') : false,
  );
  const action: OrderAction | null = primaryAction(order.status, allowed);
  if (!action) return null;
  const label = orderActionShortLabel(action);
  const aria = `${label}: ${order.publicReference}`;
  if (action === 'collect') {
    return (
      <ConfirmDialog
        trigger={
          <Button size={size} variant="success" block={block} aria-label={aria}>
            <ActionIcon action={action} />
            {label}
          </Button>
        }
        title={t('admin.orders.collectTitle')}
        description={t('admin.orders.collectText', { name: order.customerName, count: order.itemCount, total: formatMoney(order.total, order.currency) })}
        confirmLabel={t('admin.orders.actionCollect')}
        variant="success"
        onConfirm={() => run.mutateAsync({ id: order.id, action })}
      />
    );
  }
  return (
    <Button size={size} variant={action === 'ready' ? 'primary' : 'outline'} block={block} loading={run.isPending} aria-label={aria} onClick={() => run.mutate({ id: order.id, action })}>
      <ActionIcon action={action} />
      {label}
    </Button>
  );
}

function OrdersTable({ orders, showLocation, showDate }: { orders: OrderListItemDto[]; showLocation: boolean; showDate: boolean }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-soft md:block">
      <table className="w-full text-left text-[0.95rem]">
        <thead className="border-b border-border bg-surface-muted/60 text-sm text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">{t('admin.orders.reference')}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t('admin.orders.pickup')}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t('admin.orders.customer')}</th>
            {showLocation && <th scope="col" className="px-4 py-3 font-medium">{t('admin.orders.location')}</th>}
            <th scope="col" className="px-4 py-3 text-right font-medium">{t('admin.orders.items')}</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">{t('admin.orders.total')}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t('admin.orders.status')}</th>
            <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">{t('app.actions')}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-surface-muted/40" data-testid="order-row">
              <td className="px-4 py-3">
                <Link to={`/admin/bestellungen/${o.id}`} className="font-mono font-semibold tracking-wider text-primary-strong hover:underline">
                  {o.publicReference}
                </Link>
                {o.hasNote && <MessageSquare className="ml-1.5 inline size-4 text-muted-foreground" aria-label={t('admin.orders.hasNote')} />}
              </td>
              <td className="px-4 py-3 whitespace-nowrap tabular">
                {showDate && <span className="block text-sm text-muted-foreground">{formatDateShort(o.pickupDate)}</span>}
                {formatTimeRange(o.slotStart, o.slotEnd)}
              </td>
              <td className="px-4 py-3">{o.customerName}</td>
              {showLocation && <td className="px-4 py-3 text-muted-foreground">{o.locationName}</td>}
              <td className="px-4 py-3 text-right tabular">{o.itemCount}</td>
              <td className="px-4 py-3 text-right tabular">{formatMoney(o.total, o.currency)}</td>
              <td className="px-4 py-3">
                <OrderStatusBadge status={o.status} />
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <QuickAction order={o} />
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link to={`/admin/bestellungen/${o.id}`} aria-label={`${t('admin.orders.details')}: ${o.publicReference}`}>
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderCard({ order, showDate }: { order: OrderListItemDto; showDate: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="order-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/admin/bestellungen/${order.id}`} className="font-mono text-lg font-bold tracking-wider text-primary-strong hover:underline">
            {order.publicReference}
          </Link>
          <p className="truncate text-[1.05rem] font-semibold">{order.customerName}</p>
          <p className="text-sm text-muted-foreground tabular">
            {showDate && `${formatDateShort(order.pickupDate)} · `}
            {formatTimeRange(order.slotStart, order.slotEnd)} · {t('admin.dashboard.slotItems', { count: order.itemCount })} · {formatMoney(order.total, order.currency)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} size="md" />
      </div>
      {order.hasNote && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden="true" />
          {t('admin.orders.hasNote')}
        </p>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <QuickAction order={order} size="lg" block />
        </div>
        <Button asChild variant="outline" size="lg">
          <Link to={`/admin/bestellungen/${order.id}`}>{t('admin.orders.details')}</Link>
        </Button>
      </div>
    </Card>
  );
}

function OrdersCards({ orders, showDate }: { orders: OrderListItemDto[]; showDate: boolean }) {
  return (
    <ul className="grid gap-3 md:hidden">
      {orders.map((o) => (
        <li key={o.id}>
          <OrderCard order={o} showDate={showDate} />
        </li>
      ))}
    </ul>
  );
}

function SlotGroups({ orders, showDate }: { orders: OrderListItemDto[]; showDate: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, { date: string; start: string; end: string; items: OrderListItemDto[] }>();
    for (const o of orders) {
      const k = `${o.pickupDate} ${o.slotStart}`;
      if (!map.has(k)) map.set(k, { date: o.pickupDate, start: o.slotStart, end: o.slotEnd, items: [] });
      map.get(k)!.items.push(o);
    }
    return [...map.values()];
  }, [orders]);
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={`${g.date}-${g.start}`} aria-labelledby={`slot-${g.date}-${g.start}`}>
          <h2 id={`slot-${g.date}-${g.start}`} className="mb-2 flex items-baseline gap-3 text-lg font-semibold">
            <span className="tabular">
              {showDate && `${formatDateShort(g.date)} · `}
              {formatTimeRange(g.start, g.end)}
            </span>
            <span className="text-sm font-normal text-muted-foreground">{t('admin.orders.ordersInSlot', { count: g.items.length })}</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((o) => (
              <li key={o.id}>
                <OrderCard order={o} showDate={false} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
