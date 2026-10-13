import { ClipboardList, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { formatDateLong, formatTimeRange } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { listMyOrders, removeMyOrder } from './myOrders';

export function MyOrdersPage() {
  const [orders, setOrders] = useState(listMyOrders);
  useDocumentTitle(t('order.myOrdersTitle'));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">{t('order.myOrdersTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('order.myOrdersText')}</p>
      <div className="mt-6">
        {orders.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-6" />} title={t('order.myOrdersEmpty')} description={t('order.myOrdersEmptyHint')} />
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.reference}>
                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-bold tracking-widest">{o.reference}</p>
                    <p className="font-medium">{o.bakeryName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateLong(o.pickupDate)}, {formatTimeRange(o.slotStart, o.slotEnd)} · {formatMoney(o.total)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild>
                      <Link to={`/bestellung/${o.reference}`}>{t('order.show')}</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t('order.remove')}: ${o.reference}`}
                      onClick={() => {
                        removeMyOrder(o.reference);
                        setOrders(listMyOrders());
                        toast.info(t('order.removed'));
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
