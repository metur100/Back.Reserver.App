import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarPlus, CircleCheckBig, Clock, Info, MapPin, Phone, SearchX, Wallet } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { isApiError } from '@/api/client';
import { publicApi } from '@/api/endpoints';
import type { OrderStatus, PublicOrderDto } from '@/api/types';
import { OrderStatusBadge } from '@/components/common/status';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, Skeleton } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t, type TranslationKey } from '@/i18n';
import { formatDateLong, formatDateTimeLong, formatTimeRange } from '@/lib/format';
import { buildIcs } from '@/lib/ics';
import { saveBlob } from '@/lib/download';
import { consumeHashParams } from '@/lib/hash';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { findMyOrder, saveMyOrder } from './myOrders';
import { publicKeys } from './queries';

/** Tokens captured from the URL fragment before it is cleared (survives StrictMode double renders). */
const capturedTokens = new Map<string, string>();

function resolveToken(reference: string): string | null {
  const fromHash = consumeHashParams().get('t');
  if (fromHash) capturedTokens.set(reference, fromHash);
  return capturedTokens.get(reference) ?? findMyOrder(reference)?.token ?? null;
}

const statusText: Record<OrderStatus, TranslationKey> = {
  Confirmed: 'order.statusConfirmed',
  Preparing: 'order.statusPreparing',
  ReadyForPickup: 'order.statusReady',
  Collected: 'order.statusCollected',
  Cancelled: 'order.statusCancelled',
  NoShow: 'order.statusNoShow',
};

export function OrderPage() {
  const { reference = '' } = useParams();
  const location = useLocation();
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true;
  const token = useMemo(() => resolveToken(reference), [reference]);
  const queryClient = useQueryClient();
  useDocumentTitle(t('order.titleStatus'));

  const orderQ = useQuery({
    queryKey: publicKeys.order(reference),
    queryFn: ({ signal }) => publicApi.order(reference, token!, signal),
    enabled: !!token,
    refetchInterval: 60_000,
    retry: (count, error) => !(isApiError(error) && (error.isNotFound || error.isRateLimited)) && count < 2,
  });

  const order = orderQ.data;
  useEffect(() => {
    if (!order || !token) return;
    saveMyOrder({
      reference: order.publicReference,
      token,
      bakeryName: order.bakeryName,
      bakerySlug: order.bakerySlug,
      pickupDate: order.pickupDate,
      slotStart: order.slotStart,
      slotEnd: order.slotEnd,
      total: order.total,
      savedAt: Date.now(),
    });
  }, [order, token]);

  const cancel = useMutation({
    mutationFn: () => publicApi.cancelOrder(reference, token!),
    onSuccess: (updated) => {
      queryClient.setQueryData(publicKeys.order(reference), updated);
      toast.success(t('order.cancelled'));
    },
    onError: (error) => {
      toast.fromError(error);
      void orderQ.refetch();
    },
  });

  if (!token || (orderQ.isError && isApiError(orderQ.error) && orderQ.error.isNotFound)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={<SearchX className="size-6" />}
          title={t('order.notFoundTitle')}
          description={t('order.notFoundText')}
          action={
            <Button asChild variant="outline">
              <Link to="/meine-bestellungen">{t('order.myOrdersTitle')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (orderQ.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" role="status" aria-label={t('app.loading')}>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (orderQ.isError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState error={orderQ.error} onRetry={() => void orderQ.refetch()} />
      </div>
    );
  }

  return <OrderView order={order!} justCreated={justCreated} onCancel={() => cancel.mutateAsync()} />;
}

function OrderView({ order, justCreated, onCancel }: { order: PublicOrderDto; justCreated: boolean; onCancel: () => Promise<unknown> }) {
  const cancelled = order.status === 'Cancelled';
  const address = `${order.location.street}, ${order.location.postalCode} ${order.location.city}`;

  const downloadIcs = () => {
    const ics = buildIcs({
      uid: order.publicReference,
      title: t('order.calendarTitle', { bakery: order.bakeryName, code: order.publicReference }),
      description: `${t('order.pickupCode')}: ${order.publicReference}\n${order.items.map((i) => `${i.quantity} × ${i.productName}`).join('\n')}\n${t('order.toPay')}: ${formatMoney(order.total, order.currency)}`,
      location: `${order.location.name}, ${address}`,
      date: order.pickupDate,
      start: order.slotStart,
      end: order.slotEnd,
    });
    saveBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `abholung-${order.publicReference}.ics`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      {justCreated && !cancelled ? (
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-success/25 bg-success-soft p-5" role="status">
          <CircleCheckBig className="size-9 shrink-0 text-success" aria-hidden="true" />
          <div>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t('order.successTitle')}</h1>
            <p className="mt-1 text-[0.95rem]">{t('order.successText', { name: order.customerFirstName })}</p>
          </div>
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          <p className="text-sm text-muted-foreground">{order.bakeryName}</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t('order.titleStatus')}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={order.status} size="md" />
            <span className="text-[0.95rem]">{t(statusText[order.status])}</span>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t('order.pickupCode')}</p>
            <p className={`font-mono text-4xl font-bold tracking-[0.18em] sm:text-5xl ${cancelled ? 'text-muted-foreground line-through' : ''}`} data-testid="pickup-code">
              {order.publicReference}
            </p>
            <p className="text-[0.95rem] text-muted-foreground">{t('order.pickupCodeHint')}</p>
            {justCreated && (
              <div className="pt-1">
                <OrderStatusBadge status={order.status} size="md" />
              </div>
            )}
          </div>
          {!cancelled && (
            <div className="justify-self-center rounded-lg border border-border bg-white p-3" data-testid="pickup-qr">
              <QRCodeSVG value={order.publicReference} size={168} level="M" marginSize={0} role="img" aria-label={t('order.qrLabel', { code: order.publicReference })} title={order.publicReference} />
            </div>
          )}
        </div>
        <div className="grid gap-4 border-t border-border bg-background/60 p-5 sm:grid-cols-2 sm:p-6">
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">{t('order.pickup')}</p>
              <p className="font-semibold">{formatDateLong(order.pickupDate)}</p>
              <p className="font-semibold">{formatTimeRange(order.slotStart, order.slotEnd)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">{t('order.location')}</p>
              <p className="font-semibold">
                {order.bakeryName} – {order.location.name}
              </p>
              <p>{address}</p>
              {order.location.phone && (
                <a className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-primary-strong hover:underline" href={`tel:${order.location.phone.replace(/[^\d+]/g, '')}`}>
                  <Phone className="size-4" aria-hidden="true" />
                  {order.location.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>

      {cancelled && order.cancelledAt && (
        <Alert tone="danger" className="mt-4">
          {t('order.cancelledAt', { date: formatDateTimeLong(order.cancelledAt) })}
        </Alert>
      )}

      <Card className="mt-4">
        <CardContent>
          <h2 className="mb-3 font-semibold">{t('order.items')}</h2>
          <ul className="divide-y divide-border">
            {order.items.map((item) => (
              <li key={item.productName} className="flex justify-between gap-3 py-2.5">
                <span>
                  <span className="font-semibold tabular">{item.quantity} ×</span> {item.productName}
                </span>
                <span className="tabular">{formatMoney(item.lineTotal, order.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
            <span className="font-semibold">{t('order.toPay')}</span>
            <span className="text-2xl font-semibold tabular">{formatMoney(order.total, order.currency)}</span>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4 shrink-0" aria-hidden="true" />
            {t('order.payAtPickup')}
          </p>
          {order.customerNote && (
            <p className="mt-3 text-sm">
              <span className="font-medium">{t('order.note')}:</span> {order.customerNote}
            </p>
          )}
        </CardContent>
      </Card>

      {order.pickupInstructions && (
        <Alert tone="info" title={t('order.instructions')} className="mt-4">
          {order.pickupInstructions}
        </Alert>
      )}

      {!cancelled && order.status !== 'Collected' && order.status !== 'NoShow' && (
        <Card className="mt-4">
          <CardContent className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Info className="size-4.5 text-muted-foreground" aria-hidden="true" />
              {t('order.cancellationPolicy')}
            </h2>
            {order.cancellationPolicyText && <p className="text-[0.95rem] text-muted-foreground">{order.cancellationPolicyText}</p>}
            <p className="text-[0.95rem]">
              {order.canCancel ? t('order.cancelUntil', { deadline: formatDateTimeLong(order.cancellationDeadline) }) : t('order.cancelClosed')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="lg" onClick={downloadIcs}>
                <CalendarPlus aria-hidden="true" />
                {t('order.addToCalendar')}
              </Button>
              {order.canCancel && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="lg" className="text-danger hover:bg-danger-soft">
                      {t('order.cancel')}
                    </Button>
                  }
                  title={t('order.cancelTitle')}
                  description={t('order.cancelText')}
                  confirmLabel={t('order.cancelConfirm')}
                  cancelLabel={t('order.cancelKeep')}
                  variant="danger"
                  onConfirm={onCancel}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <Button asChild variant="link">
          <Link to={`/b/${order.bakerySlug}`}>{t('order.backToBakery', { bakery: order.bakeryName })}</Link>
        </Button>
      </div>
    </div>
  );
}
