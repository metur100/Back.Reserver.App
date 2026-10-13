import { ArrowRight, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { formatDateLong } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { basketCount, basketTotalCents, lineTotalCents, type Basket } from './basket';

interface BasketPanelProps {
  basket: Basket | null;
  locationName?: string;
  checkoutHref: string;
  onChangeQuantity: (productId: string, quantity: number) => void;
  onClear: () => void;
}

/** Desktop side panel listing the basket. */
export function BasketPanel({ basket, locationName, checkoutHref, onChangeQuantity, onClear }: BasketPanelProps) {
  const count = basketCount(basket);
  const total = basketTotalCents(basket);
  return (
    <aside aria-labelledby="basket-heading" className="rounded-xl border border-border bg-surface shadow-soft" data-testid="basket-panel">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="basket-heading" className="flex items-center gap-2 font-semibold">
          <ShoppingBag className="size-5 text-primary" aria-hidden="true" />
          {t('basket.title')}
        </h2>
        {count > 0 && <span className="text-sm text-muted-foreground">{t('basket.items', { count })}</span>}
      </div>
      {!basket || basket.items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-medium">{t('basket.empty')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('basket.emptyHint')}</p>
        </div>
      ) : (
        <>
          <p className="px-4 pt-3 text-sm text-muted-foreground">
            {t('basket.forPickup', { date: formatDateLong(basket.date) })}
            {locationName ? ` · ${locationName}` : ''}
          </p>
          <ul className="divide-y divide-border px-4">
            {basket.items.map((item) => (
              <li key={item.productId} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular font-medium">{formatCents(lineTotalCents(item))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <QuantityStepper value={item.quantity} max={item.maxQuantity} onChange={(q) => onChangeQuantity(item.productId, q)} label={item.name} />
                  <span className="text-sm text-muted-foreground tabular">à {formatCents(item.unitPriceCents)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-3 border-t border-border px-4 py-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{t('basket.total')}</span>
              <span className="text-xl font-semibold tabular">{formatCents(total)}</span>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="size-4 shrink-0" aria-hidden="true" />
              {t('basket.payNote')}
            </p>
            <Button asChild block size="lg">
              <Link to={checkoutHref}>
                {t('basket.toCheckout')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" block onClick={onClear}>
              <Trash2 aria-hidden="true" />
              {t('basket.clear')}
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

/** Mobile sticky bottom bar: count + total + "Weiter". */
export function BasketBar({ basket, checkoutHref }: { basket: Basket | null; checkoutHref: string }) {
  const count = basketCount(basket);
  if (count === 0) return null;
  const total = formatCents(basketTotalCents(basket));
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-overlay backdrop-blur lg:hidden" data-testid="basket-bar">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary-strong" aria-hidden="true">
            <ShoppingBag className="size-5" />
            <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">{count}</span>
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t('basket.items', { count })}</p>
            <p className="text-lg leading-tight font-semibold tabular">{total}</p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link to={checkoutHref} aria-label={t('basket.open', { count, total })}>
            {t('basket.continue')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
