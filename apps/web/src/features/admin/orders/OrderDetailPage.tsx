import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, Mail, MapPin, MessageSquare, Phone, SearchX, Wallet } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { isApiError } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import { OrderStatusBadge } from '@/components/common/status';
import { EmptyState, ErrorState, UpdatedAgo } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/surface';
import { t } from '@/i18n';
import { formatDateLong, formatDateTime, formatTimeRange } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAdmin } from '../AdminContext';
import { OrderActionBar, OrderHistory } from './orderActions';

export default function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const { key, can } = useAdmin();
  const orderQ = useQuery({
    queryKey: key('order', orderId),
    queryFn: () => adminApi.order(orderId),
    refetchInterval: 20_000,
  });
  const order = orderQ.data;
  useDocumentTitle(order ? t('admin.orders.detailTitle', { code: order.publicReference }) : t('admin.orders.title'));

  const back = (
    <Button asChild variant="ghost" className="-ml-3 mb-2">
      <Link to="/admin/bestellungen">
        <ArrowLeft aria-hidden="true" />
        {t('admin.orders.backToList')}
      </Link>
    </Button>
  );

  if (orderQ.isPending) {
    return (
      <div className="space-y-4" role="status" aria-label={t('app.loading')}>
        {back}
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }
  if (orderQ.isError) {
    if (isApiError(orderQ.error) && (orderQ.error.isNotFound || orderQ.error.status === 400)) {
      return (
        <div>
          {back}
          <EmptyState icon={<SearchX className="size-6" />} title={t('admin.orders.notFoundTitle')} description={t('admin.orders.notFoundText')} />
        </div>
      );
    }
    return (
      <div>
        {back}
        <ErrorState error={orderQ.error} onRetry={() => void orderQ.refetch()} />
      </div>
    );
  }

  const o = order!;
  return (
    <div>
      {back}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-3xl font-bold tracking-[0.12em]" data-testid="order-reference">
            {o.publicReference}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={o.status} size="lg" />
            <UpdatedAgo updatedAt={orderQ.dataUpdatedAt} fetching={orderQ.isFetching} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.orders.pickup')}</p>
                  <p className="text-lg font-semibold">{formatDateLong(o.pickupDate)}</p>
                  <p className="text-lg font-semibold">{formatTimeRange(o.slotStart, o.slotEnd)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.orders.location')}</p>
                  <p className="font-semibold">{o.locationName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.orders.createdAt')}: {formatDateTime(o.createdAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.orders.customer')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xl font-semibold">{o.customerName}</p>
              {o.customerEmail || o.customerPhone ? (
                <div className="flex flex-col gap-1 sm:flex-row sm:gap-5">
                  {o.customerEmail && (
                    <a href={`mailto:${o.customerEmail}`} className="inline-flex min-h-11 items-center gap-2 text-primary-strong hover:underline">
                      <Mail className="size-4" aria-hidden="true" />
                      {o.customerEmail}
                    </a>
                  )}
                  {o.customerPhone && (
                    <a href={`tel:${o.customerPhone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center gap-2 text-primary-strong hover:underline">
                      <Phone className="size-4" aria-hidden="true" />
                      {o.customerPhone}
                    </a>
                  )}
                </div>
              ) : (
                !can('CustomerContactView') && <p className="text-sm text-muted-foreground">{t('admin.orders.contactHidden')}</p>
              )}
              {o.customerNote && (
                <Alert tone="info" title={t('admin.orders.note')}>
                  <span className="inline-flex items-start gap-2">
                    <MessageSquare className="sr-only" aria-hidden="true" />
                    {o.customerNote}
                  </span>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.orders.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {o.items.map((item) => (
                  <li key={item.productId} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span>
                      <span className="text-lg font-bold tabular">{item.quantity} ×</span> <span className="text-[1.05rem]">{item.productName}</span>
                    </span>
                    <span className="tabular text-muted-foreground">{formatMoney(item.lineTotal, o.currency)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-semibold">{t('admin.orders.total')}</span>
                <span className="text-2xl font-semibold tabular">{formatMoney(o.total, o.currency)}</span>
              </div>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="size-4" aria-hidden="true" />
                {t('admin.orders.payAtPickup')}
              </p>
            </CardContent>
          </Card>

          {o.cancellationReason && (
            <Alert tone="danger" title={t('admin.orders.cancelReasonLabel')}>
              {o.cancellationReason}
            </Alert>
          )}
        </div>

        <div className="space-y-4">
          {(o.allowedActions.length > 0 || can('PickupCollect') || can('OrdersProcess')) && (
            <Card>
              <CardHeader>
                <CardTitle>{t('app.actions')}</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderActionBar order={o} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.orders.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderHistory history={o.history} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
