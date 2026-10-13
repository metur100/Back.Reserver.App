import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { adminApi } from '@/api/client';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { OrderListItemDto, OrderQuery, OrderStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { OrderStatusBadge } from '@/components/Badges';
import { AppText, Button, Card, Chip, EmptyState, ErrorState, Icon, ListSkeleton, Notice, TextField } from '@/components/ui';
import { de } from '@/i18n/de';
import { OPEN_STATUSES, primaryActionFor } from '@/staff/actions';
import { useOrderAction } from '@/staff/useOrderAction';
import { useStaffLocations } from '@/staff/useStaffLocations';
import { colors, spacing } from '@/theme';
import { confirmDialog } from '@/utils/dialogs';
import { berlinToday, formatDateLong, formatMoney, formatTime, formatTimeRange, toBerlin } from '@/utils/format';

type StatusFilter = 'open' | 'all' | OrderStatus;
const STATUS_FILTERS: StatusFilter[] = ['open', 'Confirmed', 'Preparing', 'ReadyForPickup', 'Collected', 'Cancelled', 'all'];
const REFRESH_MS = 20_000;
const PAGE_SIZE = 100;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function TodayScreen() {
  const { tenantId, locationId, setLocationId, can } = useAuth();
  const locations = useStaffLocations();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 400);
  const [today, setToday] = useState(berlinToday);

  // Roll over to the next day while the app stays open.
  useEffect(() => {
    const t = setInterval(() => setToday(berlinToday()), 60_000);
    return () => clearInterval(t);
  }, []);

  const query: OrderQuery = {
    dateFrom: today,
    dateTo: today,
    locationId: locationId ?? undefined,
    status: statusFilter === 'all' ? undefined : statusFilter === 'open' ? OPEN_STATUSES : [statusFilter],
    search: debouncedSearch || undefined,
    pageSize: PAGE_SIZE,
  };

  const ordersQuery = useInfiniteQuery({
    queryKey: queryKeys.staff.orders(tenantId ?? '', query),
    queryFn: ({ pageParam }) => adminApi.listOrders({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined),
    enabled: !!tenantId,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const action = useOrderAction();

  const all = useMemo(() => ordersQuery.data?.pages.flatMap((p) => p.items) ?? [], [ordersQuery.data]);
  const slots = useMemo(() => [...new Set(all.map((o) => o.slotStart))].sort(), [all]);
  const sections = useMemo(() => {
    const filtered = slotFilter ? all.filter((o) => o.slotStart === slotFilter) : all;
    const groups = new Map<string, OrderListItemDto[]>();
    for (const o of filtered) {
      const key = `${o.slotStart}|${o.slotEnd}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const [start, end] = key.split('|') as [string, string];
        return { key, title: de.staff.slotHeader(formatTimeRange(start, end), data.length), data };
      });
  }, [all, slotFilter]);

  const runAction = async (order: OrderListItemDto) => {
    const next = primaryActionFor(order.status, can);
    if (!next) return;
    if (next === 'collect') {
      const ok = await confirmDialog({
        title: de.staff.collectTitle,
        message: de.staff.collectMessage(order.publicReference, order.customerName),
        confirmLabel: de.staff.collectConfirm,
      });
      if (!ok) return;
    }
    action.mutate({ id: order.id, action: next });
  };

  const lastUpdated = ordersQuery.dataUpdatedAt ? toBerlin(new Date(ordersQuery.dataUpdatedAt)).time : null;
  const forbidden = isApiError(ordersQuery.error) && ordersQuery.error.status === 403;

  const header = (
    <View style={styles.header}>
      <AppText variant="heading" accessibilityRole="header">
        {formatDateLong(today)}
      </AppText>
      {locations.data && locations.data.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={de.staff.allLocations} selected={!locationId} onPress={() => setLocationId(null)} icon="business" />
          {locations.data.map((l) => (
            <Chip key={l.id} label={l.name} selected={locationId === l.id} onPress={() => setLocationId(l.id)} icon="location" />
          ))}
        </ScrollView>
      ) : null}
      <TextField
        label={de.staff.search}
        placeholder={de.staff.searchPlaceholder}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f}
            label={f === 'open' ? de.staff.filterOpen : f === 'all' ? de.staff.filterAll : de.staffStatus[f]}
            selected={statusFilter === f}
            onPress={() => setStatusFilter(f)}
          />
        ))}
      </ScrollView>
      {slots.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={de.staff.allSlots} selected={!slotFilter} onPress={() => setSlotFilter(null)} icon="time" />
          {slots.map((s) => (
            <Chip key={s} label={formatTime(s)} selected={slotFilter === s} onPress={() => setSlotFilter(s)} />
          ))}
        </ScrollView>
      ) : null}
      <AppText variant="caption">
        {de.staff.autoRefresh}
        {lastUpdated ? ` · ${de.staff.lastUpdated(lastUpdated)}` : ''}
      </AppText>
      {ordersQuery.isError && all.length > 0 ? <Notice tone="warning">{isApiError(ordersQuery.error) ? ordersQuery.error.title : de.errors.unknown}</Notice> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: de.staff.tabToday }} />
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        stickySectionHeadersEnabled
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader} accessibilityRole="header">
            <Icon name="time" size={16} color={colors.accentText} />
            <AppText variant="label">{section.title}</AppText>
          </View>
        )}
        renderItem={({ item }) => {
          const next = primaryActionFor(item.status, can);
          const busy = action.isPending && action.variables?.id === item.id;
          return (
            <View style={styles.itemWrap}>
              <Card style={styles.item} padded={false}>
                <Pressable
                  onPress={() => router.push({ pathname: '/team/bestellung/[id]', params: { id: item.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.publicReference}, ${item.customerName}, ${de.common.items(item.itemCount)}, ${de.staffStatus[item.status]}`}
                  style={({ pressed }) => [styles.itemMain, pressed && styles.pressed]}
                >
                  <View style={styles.itemTop}>
                    <AppText variant="subheading" color={colors.accentText}>
                      {item.publicReference}
                    </AppText>
                    <OrderStatusBadge status={item.status} audience="staff" />
                  </View>
                  <AppText variant="bodyStrong">{item.customerName}</AppText>
                  <View style={styles.meta}>
                    <AppText variant="caption">
                      {de.common.items(item.itemCount)} · {formatMoney(item.total, item.currency)}
                      {!locationId && locations.data && locations.data.length > 1 ? ` · ${item.locationName}` : ''}
                    </AppText>
                    {item.hasNote ? (
                      <View style={styles.noteTag}>
                        <Icon name="document-text" size={14} color={colors.warning} />
                        <AppText variant="caption" color={colors.warning}>
                          {de.staff.hasNote}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                {next ? (
                  <View style={styles.actionWrap}>
                    <Button
                      label={de.staff.actions[next] ?? next}
                      variant={next === 'collect' ? 'success' : 'primary'}
                      icon={next === 'prepare' ? 'flame' : next === 'ready' ? 'bag-handle' : 'checkmark-done'}
                      loading={busy}
                      disabled={action.isPending && !busy}
                      onPress={() => void runAction(item)}
                      accessibilityLabel={de.staff.actionA11y(de.staff.actions[next] ?? next, item.publicReference)}
                      testID={`action-${item.publicReference}`}
                    />
                  </View>
                ) : null}
              </Card>
            </View>
          );
        }}
        ListEmptyComponent={
          ordersQuery.isPending ? (
            <ListSkeleton rows={4} />
          ) : ordersQuery.isError ? (
            <ErrorState error={ordersQuery.error} title={forbidden ? de.errors.forbidden : undefined} onRetry={() => void ordersQuery.refetch()} />
          ) : (
            <EmptyState icon="receipt" title={de.staff.empty} text={de.staff.emptyHint} />
          )
        }
        ListFooterComponent={
          ordersQuery.hasNextPage ? (
            <View style={styles.footer}>
              <Button label={de.staff.loadMore} variant="secondary" loading={ordersQuery.isFetchingNextPage} onPress={() => void ordersQuery.fetchNextPage()} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={ordersQuery.isRefetching && !ordersQuery.isFetchingNextPage} onRefresh={() => void ordersQuery.refetch()} tintColor={colors.accent} />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xxl, width: '100%', maxWidth: 820, alignSelf: 'center' },
  header: { padding: spacing.lg, gap: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  itemWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  item: { overflow: 'hidden' },
  itemMain: { padding: spacing.lg, gap: spacing.xs },
  pressed: { backgroundColor: colors.surfaceMuted },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  noteTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: { padding: spacing.lg },
});
