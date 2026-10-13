import { ChevronDown, Clock, ImageOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { mediaUrl } from '@/api/client';
import type { PublicProductDto } from '@/api/types';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { AvailabilityBadge } from '@/components/common/status';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/controls';
import { Badge } from '@/components/ui/surface';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { MAX_QUANTITY_PER_ITEM } from './basket';

interface ProductCardProps {
  product: PublicProductDto;
  /** Quantity currently in the basket. */
  quantity: number;
  onAdd: () => void;
  onChangeQuantity: (quantity: number) => void;
  allergenDisclaimer: string | null;
  disabled?: boolean;
}

export function ProductCard({ product, quantity, onAdd, onChangeQuantity, allergenDisclaimer, disabled }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const soldOut = product.availability === 'SoldOut' || product.remaining <= 0;
  const max = Math.min(product.remaining, MAX_QUANTITY_PER_ITEM);
  const image = mediaUrl(product.imageUrl);
  const headingId = `product-${product.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn('flex flex-row overflow-hidden rounded-xl border border-border bg-surface shadow-soft sm:flex-col', soldOut && 'opacity-80')}
      data-testid="product-card"
    >
      <div className="relative m-3 mr-0 size-24 shrink-0 self-start overflow-hidden rounded-lg bg-surface-muted min-[420px]:size-28 sm:m-0 sm:aspect-[4/3] sm:size-auto sm:self-auto sm:rounded-none">
        {image && !imageFailed ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className={cn('size-full object-cover', soldOut && 'grayscale')}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-subtle-foreground" aria-hidden="true">
            <ImageOff className="size-8" />
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 hidden sm:block">
          <AvailabilityBadge availability={product.availability} remaining={product.remaining} className="bg-surface/95 shadow-soft" />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
        <div className="sm:hidden">
          <AvailabilityBadge availability={product.availability} remaining={product.remaining} />
        </div>
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h3 id={headingId} className="min-w-0 text-[1.05rem] leading-snug font-semibold break-words hyphens-auto">
              {product.name}
            </h3>
            <p className="shrink-0 text-[1.05rem] font-semibold tabular whitespace-nowrap">{formatMoney(product.price, product.currency)}</p>
          </div>
          {product.description && <p className="line-clamp-2 text-[0.95rem] text-muted-foreground">{product.description}</p>}
        </div>

        {(product.dietaryLabels.length > 0 || product.leadTimeHours > 0) && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('bakery.details')}>
            {product.dietaryLabels.map((label) => (
              <li key={label}>
                <Badge tone="success">{label}</Badge>
              </li>
            ))}
            {product.leadTimeHours > 0 && (
              <li>
                <Badge tone="neutral">
                  <Clock aria-hidden="true" />
                  {t('bakery.leadTime', { hours: product.leadTimeHours })}
                </Badge>
              </li>
            )}
          </ul>
        )}

        <Collapsible>
          <CollapsibleTrigger className="group inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-medium text-primary-strong hover:underline">
            {t('bakery.allergens')}
            {product.ingredients ? ` & ${t('bakery.ingredients')}` : ''}
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1 text-sm">
            <p>
              <span className="font-medium">{t('bakery.allergens')}: </span>
              {product.allergens ? product.allergens : <span className="text-muted-foreground">{t('bakery.allergensNone')}</span>}
            </p>
            {product.ingredients && (
              <p>
                <span className="font-medium">{t('bakery.ingredients')}: </span>
                {product.ingredients}
              </p>
            )}
            {allergenDisclaimer && <p className="text-xs text-muted-foreground">{allergenDisclaimer}</p>}
          </CollapsibleContent>
        </Collapsible>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          {quantity > 0 ? (
            <>
              <QuantityStepper value={quantity} max={max} min={0} onChange={onChangeQuantity} label={product.name} disabled={disabled} />
              <span className="text-sm text-muted-foreground">
                {quantity >= max ? t('bakery.maxReached', { count: max }) : t('bakery.inBasket', { count: quantity })}
              </span>
            </>
          ) : (
            <Button
              block
              size="lg"
              variant={soldOut ? 'secondary' : 'primary'}
              disabled={soldOut || disabled}
              onClick={onAdd}
              aria-label={soldOut ? `${product.name}: ${t('availability.SoldOut')}` : t('bakery.addAria', { name: product.name })}
            >
              {soldOut ? (
                t('availability.SoldOut')
              ) : (
                <>
                  <Plus aria-hidden="true" />
                  {t('bakery.add')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
