import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { publicApi } from '@/api/client';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { PublicAvailableDateDto, PublicBakeryDto, PublicLocationDto, PublicProductDto } from '@/api/types';
import type { BasketChange } from '@/basket/basket';
import { useBasket } from '@/basket/useBasket';
import { BasketBar } from '@/components/BasketBar';
import { ProductRow } from '@/components/ProductRow';
import { AppText, Card, Chip, EmptyState, ErrorState, Icon, ListSkeleton, Notice, Skeleton } from '@/components/ui';
import { de } from '@/i18n/de';
import { addRecentBakery } from '@/recent/recentBakeries';
import { colors, spacing } from '@/theme';
import { berlinToday, formatDateRelative, formatDateTimeShort, formatTime } from '@/utils/format';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function describeChanges(changes: BasketChange[]): string {
  return changes
    .map((c) => (c.type === 'removed' ? de.basket.removed(c.name) : c.type === 'reduced' ? de.basket.reduced(c.name, c.quantity) : de.basket.priceChanged(c.name)))
    .join('\n');
}

export default function BakeryScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slug = (rawSlug ?? '').toLowerCase();
  const basketApi = useBasket(slug);
  const { basket, loaded: basketLoaded } = basketApi;

  const bakeryQuery = useQuery({ queryKey: queryKeys.bakery(slug), queryFn: () => publicApi.getBakery(slug), enabled: !!slug });
  const bakery = bakeryQuery.data;

  // User choices; null means "use the default" (derived below, no state syncing in effects).
  const [chosenLocationId, setLocationId] = useState<string | null>(null);
  const [chosenDate, setDate] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showHours, setShowHours] = useState(false);

  // Default location: the basket's location if still offered, otherwise the first one accepting orders.
  const locationId = useMemo(() => {
    if (!bakery || !basketLoaded) return null;
    if (chosenLocationId && bakery.locations.some((l) => l.id === chosenLocationId)) return chosenLocationId;
    const fromBasket = bakery.locations.find((l) => l.id === basket.locationId);
    const first = bakery.locations.find((l) => l.acceptsOrders) ?? bakery.locations[0];
    return (fromBasket ?? first)?.id ?? null;
  }, [bakery, basketLoaded, chosenLocationId, basket.locationId]);

  useEffect(() => {
    if (bakery) void addRecentBakery({ slug: bakery.slug, name: bakery.name, city: bakery.locations[0]?.city ?? null });
  }, [bakery]);

  const availabilityQuery = useQuery({
    queryKey: queryKeys.availability(slug, locationId ?? ''),
    queryFn: () => publicApi.getAvailability(slug, locationId!),
    enabled: !!locationId,
  });

  // Default date: the chosen date if orderable, else the basket's date if still orderable, else the first orderable date.
  const date = useMemo(() => {
    const dates = availabilityQuery.data;
    if (!dates) return null;
    const orderable = (d: string | null) => !!d && dates.some((x) => x.date === d && x.isOrderable);
    if (orderable(chosenDate)) return chosenDate;
    if (orderable(basket.date)) return basket.date;
    return dates.find((d) => d.isOrderable)?.date ?? null;
  }, [availabilityQuery.data, chosenDate, basket.date]);

  const productsQuery = useQuery({
    queryKey: queryKeys.products(slug, locationId ?? '', date ?? ''),
    queryFn: () => publicApi.getProducts(slug, locationId!, date!),
    enabled: !!locationId && !!date,
  });

  // The visible location/date is the basket context; re-validate the basket whenever fresh products arrive.
  // Adjustments are kept in the basket store (basketApi.changes) and shown as a notice.
  const lastReconciled = useRef<number>(0);
  const { setContext, reconcile } = basketApi;
  useEffect(() => {
    if (!productsQuery.data || !locationId || !date || !basketLoaded) return;
    if (productsQuery.dataUpdatedAt === lastReconciled.current) return;
    lastReconciled.current = productsQuery.dataUpdatedAt;
    setContext(locationId, date);
    reconcile(productsQuery.data.products);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.data, productsQuery.dataUpdatedAt, locationId, date, basketLoaded]);
  const notice = basketApi.changes.length ? describeChanges(basketApi.changes) : null;

  const location = bakery?.locations.find((l) => l.id === locationId) ?? null;
  const products = useMemo(() => {
    const list = productsQuery.data?.products ?? [];
    return categoryId ? list.filter((p) => p.categoryId === categoryId) : list;
  }, [productsQuery.data, categoryId]);
  const usedCategories = useMemo(() => {
    const ids = new Set((productsQuery.data?.products ?? []).map((p) => p.categoryId));
    return (bakery?.categories ?? []).filter((c) => ids.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [bakery, productsQuery.data]);

  const onChangeQuantity = useCallback(
    (product: PublicProductDto, quantity: number) => {
      if (locationId && date) basketApi.setContext(locationId, date);
      basketApi.setQuantity(product, quantity);
    },
    [basketApi, locationId, date],
  );

  const refreshing = bakeryQuery.isRefetching || availabilityQuery.isRefetching || productsQuery.isRefetching;
  const refresh = () => {
    void bakeryQuery.refetch();
    void availabilityQuery.refetch();
    void productsQuery.refetch();
  };

  if (bakeryQuery.isPending) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.headerSkeleton}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="90%" height={16} />
        </View>
        <ListSkeleton rows={4} />
      </SafeAreaView>
    );
  }

  if (bakeryQuery.isError || !bakery) {
    const notFound = isApiError(bakeryQuery.error) && bakeryQuery.error.status === 404;
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        {notFound ? (
          <EmptyState icon="storefront" title={de.bakery.notFound} />
        ) : (
          <ErrorState error={bakeryQuery.error} title={de.bakery.loadError} onRetry={() => void bakeryQuery.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.header}>
      <BakeryHeader bakery={bakery} location={location} showHours={showHours} onToggleHours={() => setShowHours((s) => !s)} />

      {bakery.locations.length > 1 ? (
        <View style={styles.section}>
          <AppText variant="label">{de.bakery.chooseLocation}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {bakery.locations.map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                sublabel={l.acceptsOrders ? l.city : de.bakery.notAcceptingOrders}
                icon="location"
                selected={l.id === locationId}
                onPress={() => {
                  setLocationId(l.id);
                  setDate(null);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="label">{de.bakery.pickupDate}</AppText>
        {availabilityQuery.isPending ? (
          <Skeleton height={52} />
        ) : availabilityQuery.isError ? (
          <ErrorState error={availabilityQuery.error} onRetry={() => void availabilityQuery.refetch()} />
        ) : (
          <DateChips dates={availabilityQuery.data} selected={date} onSelect={setDate} />
        )}
        {location && !location.acceptsOrders ? <Notice tone="warning">{de.bakery.notAcceptingOrders}</Notice> : null}
      </View>

      {usedCategories.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={de.bakery.categories}>
          <Chip label={de.bakery.allCategories} selected={categoryId === null} onPress={() => setCategoryId(null)} />
          {usedCategories.map((c) => (
            <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>
      ) : null}

      {notice ? (
        <Pressable onPress={basketApi.dismissChanges} accessibilityRole="button" accessibilityHint={de.common.close}>
          <Notice tone="warning">
            <AppText color={colors.warning}>{de.bakery.basketAdjusted}</AppText>
            <AppText variant="caption" color={colors.warning}>
              {notice}
            </AppText>
          </Notice>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <Stack.Screen options={{ title: bakery.name }} />
      <FlatList
        data={date ? products : []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <ProductRow product={item} quantity={basketApi.quantityOf(item.id)} onChangeQuantity={onChangeQuantity} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          productsQuery.isPending && date ? (
            <ListSkeleton rows={3} />
          ) : productsQuery.isError ? (
            <ErrorState error={productsQuery.error} onRetry={() => void productsQuery.refetch()} />
          ) : (
            <EmptyState icon="basket" title={date ? (categoryId ? de.bakery.noProductsInCategory : de.bakery.noProducts) : de.bakery.noDates} />
          )
        }
        ListFooterComponent={
          products.length > 0 ? (
            <View style={styles.footer}>
              <Notice tone="info">{bakery.allergenDisclaimer ?? de.bakery.allergenDisclaimerFallback}</Notice>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      />
      <BasketBar
        count={basketApi.count}
        totalCents={basketApi.totalCents}
        onPress={() => router.push({ pathname: '/b/[slug]/checkout', params: { slug } })}
      />
    </SafeAreaView>
  );
}

function BakeryHeader({
  bakery,
  location,
  showHours,
  onToggleHours,
}: {
  bakery: PublicBakeryDto;
  location: PublicLocationDto | null;
  showHours: boolean;
  onToggleHours: () => void;
}) {
  const hours = [...(location?.openingHours ?? [])].sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek));
  const phone = location?.phone ?? bakery.contactPhone;
  return (
    <Card style={styles.headerCard}>
      <AppText variant="title" accessibilityRole="header">
        {bakery.name}
      </AppText>
      {bakery.description ? <AppText color={colors.textMuted}>{bakery.description}</AppText> : null}
      {location ? (
        <View style={styles.addressRow}>
          <Icon name="location" size={18} color={colors.accentText} />
          <AppText style={styles.flex}>
            {location.name} · {location.street}, {location.postalCode} {location.city}
          </AppText>
        </View>
      ) : null}
      {phone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`)}
          accessibilityRole="link"
          accessibilityLabel={de.bakery.call(phone)}
          style={styles.addressRow}
        >
          <Icon name="call" size={18} color={colors.accentText} />
          <AppText color={colors.accentText}>{phone}</AppText>
        </Pressable>
      ) : null}
      {hours.length ? (
        <Pressable
          onPress={onToggleHours}
          accessibilityRole="button"
          accessibilityState={{ expanded: showHours }}
          style={styles.hoursToggle}
        >
          <Icon name="time" size={18} color={colors.accentText} />
          <AppText variant="label" color={colors.accentText} style={styles.flex}>
            {de.bakery.openingHours}
          </AppText>
          <Icon name={showHours ? 'chevron-up' : 'chevron-down'} size={18} color={colors.accentText} />
        </Pressable>
      ) : null}
      {showHours
        ? hours.map((h) => (
            <View key={h.dayOfWeek} style={styles.hoursRow} accessible>
              <AppText variant="caption" color={colors.text} style={styles.day}>
                {de.dayNames[h.dayOfWeek]}
              </AppText>
              <AppText variant="caption" color={h.isOpen ? colors.text : colors.textMuted} style={styles.flex}>
                {h.isOpen && h.opensAt && h.closesAt
                  ? `${formatTime(h.opensAt)}–${formatTime(h.closesAt)} · ${de.bakery.pickupHours} ${formatTime(h.pickupStart)}–${formatTime(h.pickupEnd)}`
                  : de.bakery.closed}
              </AppText>
            </View>
          ))
        : null}
    </Card>
  );
}

function DateChips({ dates, selected, onSelect }: { dates: PublicAvailableDateDto[]; selected: string | null; onSelect: (d: string) => void }) {
  const today = berlinToday();
  if (!dates.some((d) => d.isOrderable)) return <Notice tone="warning">{de.bakery.noDates}</Notice>;
  const selectedDate = dates.find((d) => d.date === selected);
  return (
    <View style={styles.dateWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {dates.map((d) => (
          <Chip
            key={d.date}
            testID={`date-${d.date}`}
            label={formatDateRelative(d.date, today)}
            sublabel={d.isOrderable ? undefined : (de.bakery.dateStatus[d.status] ?? de.bakery.dateStatus.unavailable)}
            selected={d.date === selected}
            disabled={!d.isOrderable}
            icon="calendar"
            onPress={() => onSelect(d.date)}
          />
        ))}
      </ScrollView>
      {selectedDate?.orderCutoffAt ? (
        <AppText variant="caption">{de.bakery.cutoffInfo(formatDateTimeShort(selectedDate.orderCutoffAt))}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xxl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { padding: spacing.lg, gap: spacing.lg },
  headerSkeleton: { padding: spacing.lg, gap: spacing.sm },
  headerCard: { gap: spacing.sm },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  hoursToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  hoursRow: { flexDirection: 'row', gap: spacing.sm },
  day: { width: 92, fontWeight: '600' },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  dateWrap: { gap: spacing.xs },
  item: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  footer: { padding: spacing.lg },
});
