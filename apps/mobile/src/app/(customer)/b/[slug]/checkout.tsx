import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { publicApi } from '@/api/client';
import { isApiError, type ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { CreateOrderRequest, PublicProductDto } from '@/api/types';
import { lineTotalCents, toOrderItems, type BasketChange } from '@/basket/basket';
import { useBasket } from '@/basket/useBasket';
import { InfoRow, StepIndicator } from '@/components/OrderParts';
import { ProductImage } from '@/components/ProductImage';
import { QuantityStepper } from '@/components/QuantityStepper';
import { SlotGrid } from '@/components/SlotGrid';
import { AppText, Button, Card, Checkbox, EmptyState, ErrorState, ListSkeleton, Notice, Skeleton, TextField } from '@/components/ui';
import {
  createCheckoutSchema,
  emptyCheckoutForm,
  MAX_NOTE_LENGTH,
  serverFieldToFormField,
  type CheckoutFormOutput,
  type CheckoutFormValues,
} from '@/checkout/schema';
import { de } from '@/i18n/de';
import { saveOrder } from '@/orders/savedOrders';
import { colors, shadowStrong, spacing } from '@/theme';
import { formatCents, formatDateLong, formatTimeRange } from '@/utils/format';

const STEPS = de.checkout.steps;

function describeChanges(changes: BasketChange[]): string[] {
  return changes.map((c) =>
    c.type === 'removed' ? de.basket.removed(c.name) : c.type === 'reduced' ? de.basket.reduced(c.name, c.quantity) : de.basket.priceChanged(c.name),
  );
}

export default function CheckoutScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slug = (rawSlug ?? '').toLowerCase();
  const queryClient = useQueryClient();
  const basketApi = useBasket(slug);
  const { basket } = basketApi;
  const locationId = basket.locationId ?? '';
  const date = basket.date ?? '';

  const [step, setStep] = useState(0);
  const [chosenSlot, setSlot] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ tone: 'warning' | 'error'; lines: string[] } | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const bakeryQuery = useQuery({ queryKey: queryKeys.bakery(slug), queryFn: () => publicApi.getBakery(slug), enabled: !!slug });
  const bakery = bakeryQuery.data;
  const location = bakery?.locations.find((l) => l.id === locationId);

  // Re-validate the basket against fresh product data before checkout.
  const productsQuery = useQuery({
    queryKey: queryKeys.products(slug, locationId, date),
    queryFn: () => publicApi.getProducts(slug, locationId, date),
    enabled: !!locationId && !!date,
    staleTime: 0,
  });
  const productsById = useMemo(() => new Map((productsQuery.data?.products ?? []).map((p) => [p.id, p])), [productsQuery.data]);
  const reconciledAt = useRef(0);
  const { reconcile } = basketApi;
  useEffect(() => {
    if (!productsQuery.data || productsQuery.dataUpdatedAt === reconciledAt.current) return;
    reconciledAt.current = productsQuery.dataUpdatedAt;
    reconcile(productsQuery.data.products); // adjustments surface via basketApi.changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.data, productsQuery.dataUpdatedAt]);
  const basketNotice = basketApi.changes.length ? describeChanges(basketApi.changes) : null;

  const productIds = useMemo(() => basket.lines.map((l) => l.productId), [basket.lines]);
  const slotsQuery = useQuery({
    queryKey: queryKeys.slots(locationId, date, productIds),
    queryFn: () => publicApi.getPickupSlots(locationId, date, productIds),
    enabled: step >= 1 && !!locationId && !!date && productIds.length > 0,
    staleTime: 10_000,
  });
  // A selected slot that became unavailable (after a refresh) no longer counts as selected.
  const slot =
    chosenSlot && slotsQuery.data && !slotsQuery.data.slots.some((s) => s.start === chosenSlot && s.available) ? null : chosenSlot;

  const schema = useMemo(
    () =>
      createCheckoutSchema({
        requireLastName: bakery?.requireCustomerLastName ?? false,
        requirePhone: bakery?.requireCustomerPhone ?? false,
      }),
    [bakery?.requireCustomerLastName, bakery?.requireCustomerPhone],
  );
  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: emptyCheckoutForm,
    mode: 'onTouched',
  });

  const goTo = (s: number) => {
    setStep(s);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleOrderError = (error: ApiError) => {
    const p = error.problem;
    switch (error.code) {
      case 'insufficient_stock':
        if (typeof p.productId === 'string') basketApi.capLine(p.productId, typeof p.remaining === 'number' ? p.remaining : 0);
        void queryClient.invalidateQueries({ queryKey: ['products', slug] });
        idempotencyKey.current = null;
        setMessages({ tone: 'warning', lines: [error.title, de.checkout.stockChanged] });
        goTo(0);
        return;
      case 'product_unavailable':
      case 'product_not_available_on_date':
        if (Array.isArray(p.productIds)) basketApi.removeLines(p.productIds);
        void queryClient.invalidateQueries({ queryKey: ['products', slug] });
        idempotencyKey.current = null;
        setMessages({ tone: 'warning', lines: [error.title] });
        goTo(0);
        return;
      case 'slot_full':
      case 'slot_too_soon':
      case 'invalid_slot':
        setSlot(null);
        void slotsQuery.refetch();
        idempotencyKey.current = null;
        setMessages({ tone: 'warning', lines: [error.title, de.checkout.slotsRefreshed] });
        goTo(1);
        return;
      case 'pickup_date_unavailable':
        idempotencyKey.current = null;
        void queryClient.invalidateQueries({ queryKey: ['availability', slug] });
        setMessages({ tone: 'error', lines: [error.title, de.checkout.dateUnavailable] });
        goTo(0);
        return;
      case 'last_name_required':
        idempotencyKey.current = null;
        form.setError('lastName', { message: error.title });
        goTo(2);
        return;
      case 'phone_required':
        idempotencyKey.current = null;
        form.setError('phone', { message: error.title });
        goTo(2);
        return;
      case 'validation_failed': {
        idempotencyKey.current = null;
        let contactError = false;
        for (const [key, msgs] of Object.entries(error.fieldErrors)) {
          const field = serverFieldToFormField(key);
          if (field && msgs[0]) {
            form.setError(field, { message: msgs[0] });
            if (field !== 'acceptTerms') contactError = true;
          }
        }
        setMessages({ tone: 'error', lines: [error.title] });
        if (contactError) goTo(2);
        return;
      }
      case 'idempotency_key_reused':
        idempotencyKey.current = null;
        setMessages({ tone: 'error', lines: [error.title] });
        return;
      default:
        // Network errors, 429 and 5xx keep the idempotency key so a retry cannot create a duplicate order.
        setMessages({ tone: 'error', lines: [error.title] });
    }
  };

  const mutation = useMutation({
    mutationFn: (request: CreateOrderRequest) => {
      idempotencyKey.current ??= Crypto.randomUUID();
      return publicApi.createOrder(request, idempotencyKey.current);
    },
    onSuccess: async (result) => {
      const order = result.order;
      await saveOrder({
        reference: order.publicReference,
        token: result.accessToken,
        bakeryName: order.bakeryName,
        bakerySlug: order.bakerySlug,
        pickupDate: order.pickupDate,
        slotStart: order.slotStart,
        slotEnd: order.slotEnd,
        savedAt: Date.now(),
      });
      queryClient.setQueryData(queryKeys.publicOrder(order.publicReference), order);
      void queryClient.invalidateQueries({ queryKey: ['products', slug] });
      basketApi.clear();
      idempotencyKey.current = null;
      router.dismissTo({ pathname: '/b/[slug]', params: { slug } });
      router.push({ pathname: '/bestellung/[ref]', params: { ref: order.publicReference, neu: '1' } });
    },
    onError: (error) => {
      if (isApiError(error)) handleOrderError(error);
      else setMessages({ tone: 'error', lines: [de.errors.unknown] });
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const onValid = (values: CheckoutFormOutput) => {
    if (submitting.current || mutation.isPending || !slot) return;
    submitting.current = true;
    setMessages(null);
    mutation.mutate({
      locationId,
      pickupDate: date,
      slotStart: slot,
      items: toOrderItems(basket),
      customer: {
        firstName: values.firstName,
        lastName: values.lastName || null,
        email: values.email,
        phone: values.phone || null,
      },
      note: values.note.trim() || null,
      acceptTerms: values.acceptTerms,
    });
  };
  const submit = () => form.handleSubmit(onValid)();

  const next = async () => {
    setMessages(null);
    if (step === 0) {
      basketApi.dismissChanges();
      goTo(1);
    }
    else if (step === 1) {
      if (!slot) setMessages({ tone: 'warning', lines: [de.checkout.pleaseChooseSlot] });
      else goTo(2);
    } else if (step === 2) {
      const ok = await form.trigger(['firstName', 'lastName', 'email', 'phone', 'note']);
      if (ok) goTo(3);
    } else {
      void submit();
    }
  };

  if (basket.lines.length === 0 && !mutation.isPending && !mutation.isSuccess) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <Stack.Screen options={{ title: de.basket.title }} />
        {messages || basketNotice ? (
          <View style={styles.pad}>
            <Notice tone={messages?.tone ?? 'warning'}>{[...(messages?.lines ?? []), ...(basketNotice ?? [])].join('\n')}</Notice>
          </View>
        ) : null}
        <EmptyState
          title={de.basket.empty}
          text={de.basket.emptyHint}
          action={<Button label={de.basket.toBakery} icon="storefront" onPress={() => router.back()} />}
        />
      </SafeAreaView>
    );
  }

  const totalCents = basket.lines.reduce((s, l) => s + lineTotalCents(l), 0);
  const selectedSlot = slotsQuery.data?.slots.find((s) => s.start === slot);
  const dateBlocked = productsQuery.data ? !productsQuery.data.dateIsOrderable : false;
  const primaryLabel = step === 3 ? (mutation.isPending ? de.checkout.submitting : de.checkout.submit) : de.common.next;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Stack.Screen options={{ title: de.checkout.title }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.inner}>
          <StepIndicator steps={STEPS} current={step} />
          {messages ? <Notice tone={messages.tone}>{messages.lines.join('\n')}</Notice> : null}
          {dateBlocked ? <Notice tone="error">{de.checkout.dateUnavailable}</Notice> : null}
          {basketNotice && step === 0 ? (
            <Notice tone="warning">
              <AppText color={colors.warning}>{de.bakery.basketAdjusted}</AppText>
              <AppText variant="caption" color={colors.warning}>
                {basketNotice.join('\n')}
              </AppText>
            </Notice>
          ) : null}

          {step === 0 ? (
            <Card style={styles.gap}>
              <AppText variant="heading" accessibilityRole="header">
                {de.basket.title}
              </AppText>
              {productsQuery.isFetching && !productsQuery.data ? <AppText variant="caption">{de.checkout.revalidating}</AppText> : null}
              {productsQuery.isError ? <ErrorState error={productsQuery.error} onRetry={() => void productsQuery.refetch()} /> : null}
              {basket.lines.map((line) => {
                const product: PublicProductDto | undefined = productsById.get(line.productId);
                return (
                  <View key={line.productId} style={styles.line}>
                    <ProductImage url={line.imageUrl} size={56} label={line.name} />
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong">{line.name}</AppText>
                      <AppText variant="caption">
                        {formatCents(line.unitPriceCents)} · {formatCents(lineTotalCents(line))}
                      </AppText>
                    </View>
                    <QuantityStepper
                      name={line.name}
                      value={line.quantity}
                      max={line.maxQuantity}
                      onChange={(q) => (product ? basketApi.setQuantity(product, q) : q === 0 ? basketApi.removeLines([line.productId]) : undefined)}
                    />
                  </View>
                );
              })}
              <View style={styles.totalRow}>
                <AppText variant="heading">{de.common.total}</AppText>
                <AppText variant="heading">{formatCents(totalCents)}</AppText>
              </View>
              <AppText variant="caption">{de.basket.serverAuthoritative}</AppText>
              {location && date ? (
                <InfoRow icon="calendar" label={de.checkout.pickup} value={`${formatDateLong(date)} · ${location.name}`} />
              ) : null}
            </Card>
          ) : null}

          {step === 1 ? (
            <Card style={styles.gap}>
              <AppText variant="heading" accessibilityRole="header">
                {de.checkout.chooseSlot}
              </AppText>
              {date ? <AppText variant="caption">{de.checkout.slotFor(formatDateLong(date))}</AppText> : null}
              {slotsQuery.isPending ? (
                <Skeleton height={140} />
              ) : slotsQuery.isError ? (
                <ErrorState error={slotsQuery.error} onRetry={() => void slotsQuery.refetch()} />
              ) : slotsQuery.data.slots.length === 0 || !slotsQuery.data.dateIsOrderable ? (
                <Notice tone="warning">{slotsQuery.data.dateIsOrderable ? de.checkout.noSlots : de.checkout.dateUnavailable}</Notice>
              ) : (
                <SlotGrid slots={slotsQuery.data.slots} selected={slot} onSelect={setSlot} />
              )}
            </Card>
          ) : null}

          {step === 2 ? (
            <Card style={styles.gap}>
              <AppText variant="heading" accessibilityRole="header">
                {de.checkout.contact}
              </AppText>
              <AppText variant="caption">{de.checkout.contactHint}</AppText>
              <Controller
                control={form.control}
                name="firstName"
                render={({ field, fieldState }) => (
                  <TextField
                    label={de.checkout.firstName}
                    required
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoComplete="given-name"
                    textContentType="givenName"
                    maxLength={80}
                    testID="input-firstName"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="lastName"
                render={({ field, fieldState }) => (
                  <TextField
                    label={bakery?.requireCustomerLastName ? de.checkout.lastName : de.checkout.lastNameOptional}
                    required={bakery?.requireCustomerLastName}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoComplete="family-name"
                    textContentType="familyName"
                    maxLength={80}
                    testID="input-lastName"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <TextField
                    label={de.checkout.email}
                    required
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    hint={de.checkout.emailHint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    maxLength={254}
                    testID="input-email"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="phone"
                render={({ field, fieldState }) => (
                  <TextField
                    label={bakery?.requireCustomerPhone ? de.checkout.phone : de.checkout.phoneOptional}
                    required={bakery?.requireCustomerPhone}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    maxLength={30}
                    testID="input-phone"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="note"
                render={({ field, fieldState }) => (
                  <TextField
                    label={de.checkout.note}
                    placeholder={de.checkout.notePlaceholder}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    hint={de.checkout.noteCounter(field.value.length, MAX_NOTE_LENGTH)}
                    multiline
                    maxLength={MAX_NOTE_LENGTH}
                    style={styles.note}
                    testID="input-note"
                  />
                )}
              />
            </Card>
          ) : null}

          {step === 3 ? (
            <>
              <Card style={styles.gap}>
                <AppText variant="heading" accessibilityRole="header">
                  {de.checkout.summary}
                </AppText>
                <InfoRow
                  icon="time"
                  label={de.checkout.pickup}
                  value={`${formatDateLong(date)}${selectedSlot ? `, ${formatTimeRange(selectedSlot.start, selectedSlot.end)} ${de.common.clock}` : ''}`}
                />
                {location ? (
                  <InfoRow icon="location" label={de.checkout.location} value={`${location.name}, ${location.street}, ${location.postalCode} ${location.city}`} />
                ) : null}
                <InfoRow
                  icon="person"
                  label={de.checkout.customer}
                  value={[
                    `${form.getValues('firstName')} ${form.getValues('lastName')}`.trim(),
                    form.getValues('email'),
                    form.getValues('phone'),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                />
                <View style={styles.gapSm}>
                  <AppText variant="label">{de.checkout.items}</AppText>
                  {basket.lines.map((l) => (
                    <View key={l.productId} style={styles.summaryLine}>
                      <AppText style={styles.flex}>
                        {l.quantity}× {l.name}
                      </AppText>
                      <AppText>{formatCents(lineTotalCents(l))}</AppText>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <AppText variant="heading">{de.common.total}</AppText>
                    <AppText variant="heading">{formatCents(totalCents)}</AppText>
                  </View>
                </View>
                {form.getValues('note').trim() ? <InfoRow icon="document-text" label={de.checkout.note} value={form.getValues('note').trim()} /> : null}
              </Card>
              <Notice tone="success">
                <AppText variant="bodyStrong" color={colors.success}>
                  {de.checkout.payAtPickup}
                </AppText>
                <AppText variant="caption" color={colors.success}>
                  {de.checkout.payAtPickupHint}
                </AppText>
              </Notice>
              {bakery?.cancellationPolicyText ? (
                <Card style={styles.gapSm}>
                  <AppText variant="label">{de.checkout.cancellationPolicy}</AppText>
                  <AppText variant="caption">{bakery.cancellationPolicyText}</AppText>
                </Card>
              ) : null}
              <Controller
                control={form.control}
                name="acceptTerms"
                render={({ field, fieldState }) => (
                  <Checkbox checked={field.value} onChange={field.onChange} label={de.checkout.terms} error={fieldState.error?.message} testID="accept-terms" />
                )}
              />
            </>
          ) : null}

          {productsQuery.isPending && step === 0 ? <ListSkeleton rows={1} /> : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerInner}>
          {step > 0 ? (
            <Button label={de.common.back} variant="secondary" icon="chevron-back" onPress={() => goTo(step - 1)} disabled={mutation.isPending} style={styles.backBtn} />
          ) : null}
          <Button
            label={primaryLabel}
            onPress={() => void next()}
            loading={mutation.isPending}
            disabled={dateBlocked || (step === 1 && !slot) || basket.lines.length === 0}
            iconRight={step < 3 ? 'chevron-forward' : undefined}
            icon={step === 3 ? 'checkmark-circle' : undefined}
            size="lg"
            style={styles.flex}
            testID="checkout-primary"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg },
  pad: { padding: spacing.lg },
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.sm },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  summaryLine: { flexDirection: 'row', gap: spacing.sm },
  note: { minHeight: 80, textAlignVertical: 'top' },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadowStrong,
  },
  footerInner: { flexDirection: 'row', gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  backBtn: { minWidth: 110 },
});
