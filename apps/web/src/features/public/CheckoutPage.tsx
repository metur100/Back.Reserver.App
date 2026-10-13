import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Clock, MapPin, ShoppingBag, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { isApiError, newIdempotencyKey } from '@/api/client';
import { publicApi } from '@/api/endpoints';
import type { CreateOrderRequest, CreateOrderResponse, PickupSlotDto, PublicBakeryDto } from '@/api/types';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Field, fieldAria, Input, Textarea } from '@/components/ui/input';
import { Alert, Card, Skeleton } from '@/components/ui/surface';
import { t } from '@/i18n';
import { formatDateLong, formatTimeRange } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import {
  applyStockLimit,
  basketCount,
  basketTotalCents,
  lineTotalCents,
  reconcileBasket,
  removeItem,
  setQuantity,
  useBasket,
  type Basket,
  type BasketChange,
} from './basket';
import { createContactSchema, MAX_NOTE, mapServerFieldToContact, type ContactFormValues } from './checkoutSchema';
import { saveMyOrder } from './myOrders';
import { PublicFooter, SkipLink } from './PublicLayout';
import { publicKeys, useBakery, usePickupSlots } from './queries';

type Step = 1 | 2 | 3 | 4;

function describeChange(change: BasketChange): string {
  switch (change.type) {
    case 'removed':
      return t('basket.removedItem', { name: change.name });
    case 'reduced':
      return t('basket.reducedItem', { name: change.name, count: change.to });
    case 'price':
      return t('basket.priceChanged', { name: change.name, price: formatCents(change.toCents) });
  }
}

export function CheckoutPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bakeryQ = useBakery(slug);
  const { basket, update } = useBasket(slug);
  const [step, setStep] = useState<Step>(1);
  const [slot, setSlot] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactFormValues | null>(null);
  const [changes, setChanges] = useState<BasketChange[]>([]);
  const [notice, setNotice] = useState<{ tone: 'warning' | 'danger' | 'info'; text: string; dateProblem?: boolean } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const idempotency = useRef<{ key: string; payload: string } | null>(null);
  useDocumentTitle(t('checkout.title'));

  const bakery = bakeryQ.data;
  const location = bakery?.locations.find((l) => l.id === basket?.locationId);
  const productIds = useMemo(() => basket?.items.map((i) => i.productId) ?? [], [basket]);
  const slotsQ = usePickupSlots(basket?.locationId, basket?.date, productIds, step >= 2 && productIds.length > 0);

  // Always re-validate the stored basket against fresh stock and prices when entering checkout.
  const check = useMutation({
    mutationFn: (b: Basket) => publicApi.products(slug, b.locationId, b.date),
    onSuccess: (data, b) => {
      queryClient.setQueryData(publicKeys.products(slug, b.locationId, b.date), data);
      if (!data.dateIsOrderable) {
        setNotice({ tone: 'danger', text: t('checkout.dateUnavailable'), dateProblem: true });
        return;
      }
      const result = reconcileBasket(b, data.products);
      if (result.changes.length > 0) {
        setChanges(result.changes);
        update(() => result.basket);
      }
    },
  });
  const checkedFor = useRef<string | null>(null);
  const { mutate: runCheck } = check;
  useEffect(() => {
    if (!basket || basket.items.length === 0) return;
    const id = `${basket.locationId}|${basket.date}`;
    if (checkedFor.current === id) return;
    checkedFor.current = id;
    runCheck(basket);
  }, [basket, runCheck]);

  const goTo = (next: Step) => {
    setStep(next);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const submit = useMutation<CreateOrderResponse, unknown, { body: CreateOrderRequest; key: string }>({
    mutationFn: ({ body, key }) => publicApi.createOrder(body, key),
    onSuccess: (data) => {
      const order = data.order;
      saveMyOrder({
        reference: order.publicReference,
        token: data.accessToken,
        bakeryName: order.bakeryName,
        bakerySlug: order.bakerySlug,
        pickupDate: order.pickupDate,
        slotStart: order.slotStart,
        slotEnd: order.slotEnd,
        total: order.total,
        savedAt: Date.now(),
      });
      queryClient.setQueryData(publicKeys.order(order.publicReference), order);
      void queryClient.invalidateQueries({ queryKey: ['public', 'products', slug] });
      update(() => null);
      idempotency.current = null;
      navigate({ pathname: `/bestellung/${order.publicReference}`, hash: `t=${data.accessToken}` }, { state: { justCreated: true } });
    },
    onError: (error) => {
      if (!isApiError(error)) {
        setNotice({ tone: 'danger', text: t('errors.unexpected') });
        return;
      }
      switch (error.code) {
        case 'insufficient_stock': {
          const productId = error.ext<string>('productId');
          const remaining = error.ext<number>('remaining') ?? 0;
          if (productId) update((b) => (b ? applyStockLimit(b, productId, remaining) : b));
          setNotice({ tone: 'warning', text: `${error.title} ${t('checkout.stockConflict')}` });
          void queryClient.invalidateQueries({ queryKey: ['public', 'products', slug] });
          goTo(1);
          return;
        }
        case 'product_unavailable':
        case 'product_not_available_on_date': {
          const ids = error.ext<string[]>('productIds') ?? [];
          update((b) => (b ? ids.reduce((acc, id) => removeItem(acc, id), b) : b));
          setNotice({ tone: 'warning', text: error.title });
          goTo(1);
          return;
        }
        case 'slot_full':
        case 'slot_too_soon':
        case 'invalid_slot':
          setSlot(null);
          setNotice({ tone: 'warning', text: error.title || t('checkout.slotConflict') });
          void slotsQ.refetch();
          goTo(2);
          return;
        case 'pickup_date_unavailable':
          setNotice({ tone: 'danger', text: error.title, dateProblem: true });
          return;
        case 'last_name_required':
        case 'phone_required':
          setNotice({ tone: 'warning', text: error.title });
          goTo(3);
          return;
        case 'validation_failed': {
          const fields = Object.keys(error.errors ?? {});
          setNotice({ tone: 'warning', text: Object.values(error.errors ?? {}).flat()[0] ?? error.title });
          if (fields.some((f) => mapServerFieldToContact(f))) goTo(3);
          return;
        }
        default:
          setNotice({
            tone: 'danger',
            text: error.isRateLimited || error.isNetwork ? `${error.title} ${t('checkout.retryHint')}` : error.title,
          });
      }
    },
  });

  if (bakeryQ.isPending) {
    return <CheckoutShell slug={slug}>{<Skeleton className="h-64 w-full" />}</CheckoutShell>;
  }
  if (bakeryQ.isError) {
    return (
      <CheckoutShell slug={slug}>
        <ErrorState error={bakeryQ.error} onRetry={() => void bakeryQ.refetch()} />
      </CheckoutShell>
    );
  }
  if (!bakery) return null;
  if (!basket || basket.items.length === 0) {
    return (
      <CheckoutShell slug={slug} bakeryName={bakery.name}>
        {changes.length > 0 && <ChangesAlert changes={changes} />}
        <EmptyState
          icon={<ShoppingBag className="size-6" />}
          title={t('checkout.emptyTitle')}
          description={t('checkout.emptyText')}
          action={
            <Button asChild>
              <Link to={`/b/${slug}`}>{t('checkout.backToShop')}</Link>
            </Button>
          }
        />
      </CheckoutShell>
    );
  }

  const selectedSlot = slotsQ.data?.slots.find((s) => s.start === slot);
  const steps = [t('checkout.step1'), t('checkout.step2'), t('checkout.step3'), t('checkout.step4')];

  const handleSubmit = () => {
    if (!contact || !slot) return;
    const body: CreateOrderRequest = {
      locationId: basket.locationId,
      pickupDate: basket.date,
      slotStart: slot,
      items: basket.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      customer: {
        firstName: contact.firstName,
        lastName: contact.lastName || null,
        email: contact.email,
        phone: contact.phone || null,
      },
      note: contact.note.trim() || null,
      acceptTerms: true,
    };
    // Reuse the key for retries of the same submission; a changed payload needs a new key.
    const payload = JSON.stringify(body);
    if (!idempotency.current || idempotency.current.payload !== payload) idempotency.current = { key: newIdempotencyKey(), payload };
    setNotice(null);
    submit.mutate({ body, key: idempotency.current.key });
  };

  return (
    <CheckoutShell slug={slug} bakeryName={bakery.name}>
      <nav aria-label={t('checkout.title')} className="mb-5">
        <p className="mb-2 text-sm text-muted-foreground sm:hidden">{t('checkout.step', { current: step, total: 4 })}</p>
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {steps.map((label, i) => {
            const n = (i + 1) as Step;
            const state = n < step ? 'done' : n === step ? 'current' : 'todo';
            return (
              <li key={label} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
                <div className={cn('h-1.5 rounded-full', state === 'todo' ? 'bg-border' : state === 'current' ? 'bg-primary' : 'bg-success')} aria-hidden="true" />
                <p className={cn('mt-1.5 hidden truncate text-sm sm:block', state === 'current' ? 'font-semibold' : 'text-muted-foreground')}>
                  {state === 'done' && <Check className="mr-1 inline size-3.5 text-success" aria-hidden="true" />}
                  {label}
                </p>
                <span className="sr-only sm:hidden">
                  {label}
                  {state === 'done' ? ' ✓' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        <div className="min-w-0 space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none sm:text-3xl">
            {steps[step - 1]}
          </h1>
          <p className="flex items-start gap-2 text-[0.95rem] text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('checkout.pickupFor', { date: formatDateLong(basket.date), location: location?.name ?? '' })}
          </p>

          {notice && (
            <Alert
              tone={notice.tone}
              live
              action={
                notice.dateProblem ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/b/${slug}`}>{t('checkout.chooseOtherDate')}</Link>
                  </Button>
                ) : undefined
              }
            >
              {notice.text}
            </Alert>
          )}
          {changes.length > 0 && step === 1 && <ChangesAlert changes={changes} onDismiss={() => setChanges([])} />}

          {step === 1 && (
            <ReviewStep
              basket={basket}
              checking={check.isPending}
              onQuantity={(id, q) => update((b) => (b ? setQuantity(b, id, q) : b))}
              onNext={() => {
                setNotice(null);
                goTo(2);
              }}
              disabled={!!notice?.dateProblem}
            />
          )}
          {step === 2 && (
            <SlotStep
              slots={slotsQ.data?.slots}
              loading={slotsQ.isPending}
              error={slotsQ.isError ? slotsQ.error : null}
              onRetry={() => void slotsQ.refetch()}
              selected={slot}
              onSelect={setSlot}
              hasLeadTime={basket.items.some((i) => i.leadTimeHours > 0)}
              onBack={() => goTo(1)}
              onNext={() => {
                setNotice(null);
                goTo(3);
              }}
            />
          )}
          {step === 3 && (
            <ContactStep
              bakery={bakery}
              defaultValues={contact}
              onBack={() => goTo(2)}
              onNext={(values) => {
                setContact(values);
                setNotice(null);
                goTo(4);
              }}
            />
          )}
          {step === 4 && contact && selectedSlot && (
            <SummaryStep
              basket={basket}
              slot={selectedSlot}
              contact={contact}
              locationLabel={location ? `${location.name}, ${location.street}, ${location.postalCode} ${location.city}` : ''}
              cancellationPolicy={bakery.cancellationPolicyText}
              submitting={submit.isPending}
              onEdit={goTo}
              onSubmit={handleSubmit}
            />
          )}
          {step === 4 && (!contact || !selectedSlot) && (
            <Alert tone="warning" action={<Button onClick={() => goTo(2)}>{t('checkout.step2')}</Button>}>
              {t('checkout.selectSlotError')}
            </Alert>
          )}
        </div>

        <aside className="hidden lg:block" aria-label={t('checkout.summary')}>
          <Card className="sticky top-4 p-4">
            <h2 className="mb-3 font-semibold">{t('checkout.summary')}</h2>
            <ul className="space-y-2 text-sm">
              {basket.items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-3">
                  <span>
                    {i.quantity} × {i.name}
                  </span>
                  <span className="tabular">{formatCents(lineTotalCents(i))}</span>
                </li>
              ))}
            </ul>
            {selectedSlot && (
              <p className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
                <Clock className="size-4" aria-hidden="true" />
                {formatTimeRange(selectedSlot.start, selectedSlot.end)}
              </p>
            )}
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-semibold">{t('basket.total')}</span>
              <span className="text-lg font-semibold tabular">{formatCents(basketTotalCents(basket))}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('basket.payNote')}</p>
          </Card>
        </aside>
      </div>
    </CheckoutShell>
  );
}

function CheckoutShell({ slug, bakeryName, children }: { slug: string; bakeryName?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="-ml-2">
            <Link to={`/b/${slug}`} aria-label={t('checkout.backToShop')}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold">{bakeryName ?? t('app.name')}</p>
            <p className="text-xs text-muted-foreground">{t('checkout.title')}</p>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-16">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

function ChangesAlert({ changes, onDismiss }: { changes: BasketChange[]; onDismiss?: () => void }) {
  return (
    <Alert
      tone="warning"
      live
      title={t('basket.changesTitle')}
      action={
        onDismiss ? (
          <Button size="sm" variant="outline" onClick={onDismiss}>
            OK
          </Button>
        ) : undefined
      }
    >
      <ul className="list-disc space-y-1 pl-5">
        {changes.map((c) => (
          <li key={`${c.type}-${c.productId}`}>{describeChange(c)}</li>
        ))}
      </ul>
    </Alert>
  );
}

function StepNav({ onBack, next }: { onBack?: () => void; next: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button variant="outline" size="lg" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t('app.back')}
        </Button>
      ) : (
        <span />
      )}
      {next}
    </div>
  );
}

function ReviewStep({
  basket,
  checking,
  onQuantity,
  onNext,
  disabled,
}: {
  basket: Basket;
  checking: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onNext: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      {checking && (
        <p className="text-sm text-muted-foreground" role="status">
          {t('checkout.checking')}
        </p>
      )}
      <Card>
        <ul className="divide-y divide-border">
          {basket.items.map((item) => (
            <li key={item.productId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground tabular">
                  à {formatCents(item.unitPriceCents)} · {t('availability.remaining', { count: item.maxQuantity })}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <QuantityStepper value={item.quantity} max={item.maxQuantity} onChange={(q) => onQuantity(item.productId, q)} label={item.name} />
                <span className="w-20 text-right font-semibold tabular">{formatCents(lineTotalCents(item))}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-border p-4">
          <span className="font-semibold">
            {t('basket.total')} <span className="font-normal text-muted-foreground">({t('basket.items', { count: basketCount(basket) })})</span>
          </span>
          <span className="text-xl font-semibold tabular">{formatCents(basketTotalCents(basket))}</span>
        </div>
      </Card>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="size-4" aria-hidden="true" />
        {t('basket.payNote')}
      </p>
      <StepNav
        next={
          <Button size="lg" onClick={onNext} disabled={disabled || checking}>
            {t('checkout.step2')}
            <ArrowRight aria-hidden="true" />
          </Button>
        }
      />
    </div>
  );
}

function SlotStep({
  slots,
  loading,
  error,
  onRetry,
  selected,
  onSelect,
  hasLeadTime,
  onBack,
  onNext,
}: {
  slots: PickupSlotDto[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selected: string | null;
  onSelect: (start: string) => void;
  hasLeadTime: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const [showError, setShowError] = useState(false);
  const anyAvailable = slots?.some((s) => s.available);
  return (
    <div className="space-y-4">
      <p className="text-[0.95rem] text-muted-foreground">{t('checkout.slotsHint')}</p>
      {hasLeadTime && <Alert tone="info">{t('checkout.leadTimeNote')}</Alert>}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="status" aria-label={t('app.loading')}>
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <ErrorState compact error={error} onRetry={onRetry} />
      ) : !slots || !anyAvailable ? (
        <Alert tone="warning">{t('checkout.noSlots')}</Alert>
      ) : (
        <fieldset>
          <legend className="sr-only">{t('checkout.slotsTitle')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((s) => {
              const reason = s.unavailableReason === 'full' ? t('checkout.slotFull') : s.unavailableReason === 'too_soon' ? t('checkout.slotTooSoon') : null;
              const checked = selected === s.start;
              return (
                <label
                  key={s.start}
                  className={cn(
                    'relative flex min-h-16 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    !s.available && 'cursor-not-allowed border-dashed border-border bg-surface-muted/60 text-subtle-foreground',
                    s.available && !checked && 'border-border-strong bg-surface hover:border-foreground',
                    checked && 'border-primary bg-primary-soft ring-1 ring-primary',
                  )}
                >
                  <input
                    type="radio"
                    name="slot"
                    value={s.start}
                    className="sr-only"
                    checked={checked}
                    disabled={!s.available}
                    onChange={() => {
                      onSelect(s.start);
                      setShowError(false);
                    }}
                  />
                  <span className="font-semibold tabular">{formatTimeRange(s.start, s.end)}</span>
                  <span className="text-xs">
                    {reason ?? (s.remainingOrders <= 3 ? t('checkout.slotFew', { count: s.remainingOrders }) : ' ')}
                  </span>
                  {checked && <Check className="absolute top-2 right-2 size-4 text-primary-strong" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {showError && (
        <p className="text-sm font-medium text-danger" role="alert">
          {t('checkout.selectSlotError')}
        </p>
      )}
      <StepNav
        onBack={onBack}
        next={
          <Button
            size="lg"
            onClick={() => {
              if (!selected || !slots?.some((s) => s.start === selected && s.available)) {
                setShowError(true);
                return;
              }
              onNext();
            }}
          >
            {t('checkout.step3')}
            <ArrowRight aria-hidden="true" />
          </Button>
        }
      />
    </div>
  );
}

function ContactStep({
  bakery,
  defaultValues,
  onBack,
  onNext,
}: {
  bakery: PublicBakeryDto;
  defaultValues: ContactFormValues | null;
  onBack: () => void;
  onNext: (values: ContactFormValues) => void;
}) {
  const schema = useMemo(
    () => createContactSchema({ requireLastName: bakery.requireCustomerLastName, requirePhone: bakery.requireCustomerPhone }),
    [bakery.requireCustomerLastName, bakery.requireCustomerPhone],
  );
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? { firstName: '', lastName: '', email: '', phone: '', note: '' },
    mode: 'onTouched',
  });
  const note = useWatch({ control, name: 'note' }) ?? '';

  return (
    <form noValidate onSubmit={handleSubmit(onNext)} className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="firstName" label={t('checkout.firstName')} required error={errors.firstName?.message}>
            <Input {...fieldAria('firstName', errors.firstName?.message)} autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field
            id="lastName"
            label={t('checkout.lastName')}
            required={bakery.requireCustomerLastName}
            optional={!bakery.requireCustomerLastName}
            error={errors.lastName?.message}
          >
            <Input {...fieldAria('lastName', errors.lastName?.message)} autoComplete="family-name" {...register('lastName')} />
          </Field>
        </div>
        <Field id="email" label={t('checkout.email')} required hint={t('checkout.emailHint')} error={errors.email?.message}>
          <Input {...fieldAria('email', errors.email?.message, true)} type="email" inputMode="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field
          id="phone"
          label={t('checkout.phone')}
          required={bakery.requireCustomerPhone}
          optional={!bakery.requireCustomerPhone}
          hint={t('checkout.phoneHint')}
          error={errors.phone?.message}
        >
          <Input {...fieldAria('phone', errors.phone?.message, true)} type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
        </Field>
        <Field id="note" label={t('checkout.note')} optional error={errors.note?.message}>
          <Textarea
            {...fieldAria('note', errors.note?.message)}
            aria-describedby={errors.note ? 'note-error' : 'note-count'}
            rows={3}
            maxLength={MAX_NOTE + 50}
            placeholder={t('checkout.notePlaceholder')}
            {...register('note')}
          />
          <p id="note-count" className={cn('text-right text-xs', note.length > MAX_NOTE ? 'font-medium text-danger' : 'text-muted-foreground')}>
            {t('app.characters', { count: String(note.length), max: String(MAX_NOTE) })}
          </p>
        </Field>
      </Card>
      <StepNav
        onBack={onBack}
        next={
          <Button size="lg" type="submit">
            {t('checkout.step4')}
            <ArrowRight aria-hidden="true" />
          </Button>
        }
      />
    </form>
  );
}

function SummaryStep({
  basket,
  slot,
  contact,
  locationLabel,
  cancellationPolicy,
  submitting,
  onEdit,
  onSubmit,
}: {
  basket: Basket;
  slot: PickupSlotDto;
  contact: ContactFormValues;
  locationLabel: string;
  cancellationPolicy: string | null;
  submitting: boolean;
  onEdit: (step: Step) => void;
  onSubmit: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);
  const section = (title: string, step: Step, body: ReactNode) => (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        <div className="text-[0.95rem]">{body}</div>
      </div>
      <Button variant="link" onClick={() => onEdit(step)} className="min-h-11" aria-label={`${title}: ${t('checkout.change')}`}>
        {t('checkout.change')}
      </Button>
    </div>
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!accepted) {
          setShowError(true);
          return;
        }
        onSubmit();
      }}
      className="space-y-4"
    >
      <Card className="divide-y divide-border">
        {section(
          t('checkout.pickup'),
          2,
          <>
            <p className="font-semibold">
              {formatDateLong(basket.date)}, {formatTimeRange(slot.start, slot.end)}
            </p>
            <p className="text-muted-foreground">{locationLabel}</p>
          </>,
        )}
        {section(
          t('checkout.items'),
          1,
          <ul className="space-y-1">
            {basket.items.map((i) => (
              <li key={i.productId}>
                {i.quantity} × {i.name} <span className="text-muted-foreground tabular">({formatCents(lineTotalCents(i))})</span>
              </li>
            ))}
          </ul>,
        )}
        {section(
          t('checkout.contact'),
          3,
          <>
            <p>
              {contact.firstName} {contact.lastName}
            </p>
            <p className="text-muted-foreground">{contact.email}</p>
            {contact.phone && <p className="text-muted-foreground">{contact.phone}</p>}
            {contact.note && <p className="mt-1 italic">„{contact.note}“</p>}
          </>,
        )}
        <div className="flex items-baseline justify-between p-4">
          <span className="text-lg font-semibold">{t('basket.total')}</span>
          <span className="text-2xl font-semibold tabular">{formatCents(basketTotalCents(basket))}</span>
        </div>
      </Card>

      <Alert tone="success" title={t('checkout.payment')}>
        {t('checkout.paymentText')}
      </Alert>
      {cancellationPolicy && <p className="text-sm text-muted-foreground">{cancellationPolicy}</p>}

      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="acceptTerms"
            checked={accepted}
            onCheckedChange={(v) => {
              setAccepted(v === true);
              if (v === true) setShowError(false);
            }}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? 'acceptTerms-error' : undefined}
            className="mt-0.5"
          />
          <label htmlFor="acceptTerms" className="text-[0.95rem] leading-snug">
            {(() => {
              const [before, rest = ''] = t('checkout.acceptTerms').split('{terms}');
              const [middle, after = ''] = rest.split('{privacy}');
              return (
                <>
                  {before}
                  <Link to="/agb" target="_blank" className="font-medium text-primary-strong underline">
                    {t('checkout.termsLink')}
                  </Link>
                  {middle}
                  <Link to="/datenschutz" target="_blank" className="font-medium text-primary-strong underline">
                    {t('checkout.privacyLink')}
                  </Link>
                  {after}
                </>
              );
            })()}
          </label>
        </div>
        {showError && (
          <p id="acceptTerms-error" className="text-sm font-medium text-danger" role="alert">
            {t('validation.acceptTerms')}
          </p>
        )}
      </div>

      <StepNav
        onBack={() => onEdit(3)}
        next={
          <Button type="submit" size="xl" loading={submitting} className="sm:min-w-72">
            {submitting ? t('checkout.submitting') : t('checkout.submit')}
          </Button>
        }
      />
    </form>
  );
}

