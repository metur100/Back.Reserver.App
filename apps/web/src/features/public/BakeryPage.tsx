import { CalendarX2, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { isApiError } from '@/api/client';
import type { PublicProductDto } from '@/api/types';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect, Label } from '@/components/ui/input';
import { Alert, Skeleton } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { formatDateLong, formatDateTimeLong, relativeDay } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import { BakeryHeader } from './BakeryHeader';
import { BasketBar, BasketPanel } from './BasketPanel';
import { addItem, basketCount, basketTotalCents, emptyBasket, quantityOf, setQuantity, useBasket } from './basket';
import { DateChips } from './DateChips';
import { ProductCard } from './ProductCard';
import { PublicFooter, SkipLink } from './PublicLayout';
import { useAvailability, useBakery, useProducts } from './queries';

interface PendingSwitch {
  locationId: string;
  date?: string;
  addProduct?: PublicProductDto;
}

export function BakeryPage() {
  const { slug = '' } = useParams();
  const bakeryQ = useBakery(slug);
  const bakery = bakeryQ.data;
  const { basket, update } = useBasket(slug);
  const [params, setParams] = useSearchParams();
  const [categoryState, setCategoryState] = useState({ scope: '', value: 'all' });
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useDocumentTitle(bakery?.name);

  const locations = bakery?.locations ?? [];
  const requestedLocation = params.get('standort');
  const locationId =
    locations.find((l) => l.id === requestedLocation)?.id ?? locations.find((l) => l.id === basket?.locationId)?.id ?? locations[0]?.id;
  const location = locations.find((l) => l.id === locationId);

  const availabilityQ = useAvailability(slug, locationId);
  const dates = useMemo(() => availabilityQ.data ?? [], [availabilityQ.data]);
  const isOrderable = (d: string | null | undefined) => !!d && dates.some((x) => x.date === d && x.isOrderable);
  const requestedDate = params.get('tag');
  const basketMatchesLocation = basket?.locationId === locationId;
  const date = isOrderable(requestedDate)
    ? requestedDate!
    : basketMatchesLocation && isOrderable(basket?.date)
      ? basket!.date
      : dates.find((d) => d.isOrderable)?.date;
  const today = dates[0]?.date;

  const productsQ = useProducts(slug, locationId, date);
  const products = useMemo(() => productsQ.data?.products ?? [], [productsQ.data]);
  const basketForView = basket && basket.locationId === locationId && basket.date === date ? basket : null;
  const basketMismatch = !!basket && basket.items.length > 0 && !basketForView;

  // Drop baskets whose pickup day can no longer be ordered.
  useEffect(() => {
    if (!basket || !availabilityQ.data || basket.locationId !== locationId) return;
    const entry = availabilityQ.data.find((d) => d.date === basket.date);
    if (!entry || !entry.isOrderable) {
      update(() => null);
      toast.warning(t('checkout.dateUnavailable'));
    }
  }, [availabilityQ.data, basket, locationId, update]);

  // The category filter resets whenever the assortment (location/date) changes.
  const categoryScope = `${locationId}|${date}`;
  const category = categoryState.scope === categoryScope ? categoryState.value : 'all';
  const setCategory = (value: string) => setCategoryState({ scope: categoryScope, value });

  const applySwitch = (next: { locationId: string; date?: string }) => {
    const sp = new URLSearchParams(params);
    sp.set('standort', next.locationId);
    if (next.date) sp.set('tag', next.date);
    else sp.delete('tag');
    setParams(sp, { replace: true });
  };

  const requestSwitch = (next: { locationId: string; date?: string }) => {
    const changes = next.locationId !== locationId || (next.date !== undefined && next.date !== date);
    if (!changes) return;
    if (basket && basket.items.length > 0 && (basket.locationId !== next.locationId || (next.date && basket.date !== next.date))) {
      setPending(next);
      return;
    }
    applySwitch(next);
  };

  const announce = (message: string) => setAnnouncement(message);

  const handleAdd = (product: PublicProductDto) => {
    if (!locationId || !date) return;
    if (basketMismatch) {
      setPending({ locationId, date, addProduct: product });
      return;
    }
    update((current) => {
      const next = addItem(current ?? emptyBasket(slug, locationId, date), product, 1);
      announce(t('basket.updated', { count: basketCount(next), total: formatCents(basketTotalCents(next)) }));
      return next;
    });
    toast.success(t('bakery.added', { name: product.name }));
  };

  const handleQuantity = (productId: string, quantity: number) => {
    update((current) => {
      if (!current) return current;
      const next = setQuantity(current, productId, quantity);
      announce(t('basket.updated', { count: basketCount(next), total: formatCents(basketTotalCents(next)) }));
      return next;
    });
  };

  const confirmPending = () => {
    if (!pending) return;
    const p = pending;
    update(() => (p.addProduct && p.date ? addItem(emptyBasket(slug, p.locationId, p.date), p.addProduct, 1) : null));
    applySwitch({ locationId: p.locationId, date: p.date });
    setPending(null);
  };

  const visibleCategories = useMemo(() => {
    const used = new Set(products.map((p) => p.categoryId).filter(Boolean));
    return (bakery?.categories ?? []).filter((c) => used.has(c.id));
  }, [bakery?.categories, products]);

  const sections = useMemo(() => {
    if (category !== 'all') return [{ id: category, name: null as string | null, items: products.filter((p) => p.categoryId === category) }];
    if (visibleCategories.length <= 1) return [{ id: 'all', name: null as string | null, items: products }];
    const result = visibleCategories.map((c) => ({ id: c.id, name: c.name as string | null, items: products.filter((p) => p.categoryId === c.id) }));
    const uncategorized = products.filter((p) => !p.categoryId || !visibleCategories.some((c) => c.id === p.categoryId));
    if (uncategorized.length) result.push({ id: 'other', name: null, items: uncategorized });
    return result;
  }, [category, products, visibleCategories]);

  const checkoutHref = `/b/${slug}/checkout`;

  if (bakeryQ.isPending) return <BakeryPageSkeleton />;
  if (bakeryQ.isError) {
    const notFound = isApiError(bakeryQ.error) && bakeryQ.error.isNotFound;
    return (
      <div className="flex min-h-dvh flex-col">
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
          {notFound ? (
            <EmptyState
              icon={<Store className="size-6" />}
              title={t('bakery.notFoundTitle')}
              description={t('bakery.notFoundText')}
              action={
                <Button asChild variant="outline">
                  <Link to="/">{t('pages.toHome')}</Link>
                </Button>
              }
            />
          ) : (
            <ErrorState error={bakeryQ.error} onRetry={() => void bakeryQ.refetch()} />
          )}
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (!bakery) return <BakeryPageSkeleton />;

  const selectedDateInfo = dates.find((d) => d.date === date);
  const rel = date && today ? relativeDay(date, today) : null;
  const dayLabel = date ? (rel === 'today' ? t('bakery.today') : rel === 'tomorrow' ? t('bakery.tomorrow') : formatDateLong(date)) : '';

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <BakeryHeader bakery={bakery} location={location} />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-32 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <div className="min-w-0">
            <section aria-labelledby="pickup-heading" className="space-y-4">
              <h2 id="pickup-heading" className="sr-only">
                {t('bakery.chooseDate')}
              </h2>
              {locations.length > 1 && (
                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor="location-select">{t('bakery.chooseLocation')}</Label>
                  <NativeSelect id="location-select" value={locationId} onChange={(e) => requestSwitch({ locationId: e.target.value })}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} – {l.street}, {l.city}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}

              {location && !location.acceptsOrders ? (
                <Alert tone="warning">{t('bakery.notAcceptingOrders')}</Alert>
              ) : availabilityQ.isPending ? (
                <div className="flex gap-2 overflow-hidden" role="status" aria-label={t('app.loading')}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <Skeleton key={i} className="h-[4.25rem] w-[5.25rem] shrink-0 rounded-lg" />
                  ))}
                </div>
              ) : availabilityQ.isError ? (
                <ErrorState compact error={availabilityQ.error} onRetry={() => void availabilityQ.refetch()} />
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('bakery.pickupDate')}</p>
                    <DateChips dates={dates} selected={date} today={today ?? ''} onSelect={(d) => locationId && requestSwitch({ locationId, date: d })} />
                  </div>
                  {!dates.some((d) => d.isOrderable) && <Alert tone="info">{t('bakery.noOrderableDates')}</Alert>}
                  {selectedDateInfo?.orderCutoffAt && (
                    <p className="text-sm text-muted-foreground">
                      {t('bakery.orderCutoff', { time: formatDateTimeLong(selectedDateInfo.orderCutoffAt, location?.timeZoneId) })}
                    </p>
                  )}
                </>
              )}

              {basketMismatch && basket && (
                <Alert
                  tone="info"
                  action={
                    <Button variant="outline" size="sm" onClick={() => applySwitch({ locationId: basket.locationId, date: basket.date })}>
                      {t('basket.forPickup', { date: formatDateLong(basket.date) })}
                    </Button>
                  }
                >
                  {t('bakery.switchLocationText')}
                </Alert>
              )}
            </section>

            {date && (
              <section aria-labelledby="products-heading" className="mt-6">
                <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                  <h2 id="products-heading" className="font-display text-xl font-semibold">
                    {rel ? t('bakery.availableFor', { day: dayLabel.toLowerCase() }) : t('bakery.productsHeading', { day: dayLabel })}
                  </h2>
                  {visibleCategories.length > 1 && (
                    <div role="group" aria-label={t('bakery.categories')} className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 scrollbar-none">
                      {[{ id: 'all', name: t('bakery.allCategories') }, ...visibleCategories].map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={category === c.id}
                          onClick={() => setCategory(c.id)}
                          className={cn(
                            'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
                            category === c.id ? 'border-foreground bg-foreground text-background' : 'border-border-strong bg-surface hover:border-foreground',
                          )}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  {productsQ.isPending ? (
                    <ProductGridSkeleton />
                  ) : productsQ.isError ? (
                    <ErrorState error={productsQ.error} onRetry={() => void productsQ.refetch()} />
                  ) : products.length === 0 ? (
                    <EmptyState icon={<CalendarX2 className="size-6" />} title={t('bakery.noProductsTitle')} description={t('bakery.noProductsText')} />
                  ) : (
                    <div className="space-y-8">
                      {sections.map((section) =>
                        section.items.length === 0 ? (
                          <EmptyState key={section.id} title={t('bakery.noProductsInCategory')} />
                        ) : (
                          <div key={section.id} className="space-y-3">
                            {section.name && <h3 className="text-lg font-semibold">{section.name}</h3>}
                            <div className={cn('grid gap-4 sm:grid-cols-2', productsQ.isFetching && 'opacity-70 transition-opacity')}>
                              {section.items.map((p) => (
                                <ProductCard
                                  key={p.id}
                                  product={p}
                                  quantity={quantityOf(basketForView, p.id)}
                                  onAdd={() => handleAdd(p)}
                                  onChangeQuantity={(q) => handleQuantity(p.id, q)}
                                  allergenDisclaimer={bakery.allergenDisclaimer}
                                  disabled={!productsQ.data?.dateIsOrderable}
                                />
                              ))}
                            </div>
                          </div>
                        ),
                      )}
                      {bakery.allergenDisclaimer && <p className="text-sm text-muted-foreground">{bakery.allergenDisclaimer}</p>}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-4">
              <BasketPanel
                basket={basketForView}
                locationName={location?.name}
                checkoutHref={checkoutHref}
                onChangeQuantity={handleQuantity}
                onClear={() => update(() => null)}
              />
            </div>
          </div>
        </div>
      </main>

      <BasketBar basket={basketForView} checkoutHref={checkoutHref} />
      <PublicFooter className="mb-24 lg:mb-0" />

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={t('bakery.switchTitle')}
        description={t('bakery.switchLocationText')}
        confirmLabel={t('bakery.switchConfirm')}
        cancelLabel={t('bakery.switchKeep')}
        onConfirm={confirmPending}
      />
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label={t('app.loading')}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BakeryPageSkeleton() {
  return (
    <div className="min-h-dvh" role="status" aria-label={t('app.loading')}>
      <div className="h-3 bg-surface-sunken" />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex gap-4">
          <Skeleton className="size-16 rounded-xl sm:size-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[4.25rem] w-[5.25rem] shrink-0 rounded-lg" />
          ))}
        </div>
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
