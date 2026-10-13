import { useQueries } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { publicApi } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { OrderStatusBadge } from '@/components/Badges';
import { AppText, Card, EmptyState, Icon, ListSkeleton, Screen, Button } from '@/components/ui';
import { de } from '@/i18n/de';
import { cancelReminder } from '@/notifications/notifications';
import { removeSavedOrder, type SavedOrder } from '@/orders/savedOrders';
import { useSavedOrders } from '@/orders/useSavedOrders';
import { colors, spacing } from '@/theme';
import { confirmDialog } from '@/utils/dialogs';
import { berlinToday, formatDateRelative, formatTimeRange } from '@/utils/format';

export default function MyOrdersScreen() {
  const { orders, loading, reload } = useSavedOrders();
  const list = orders ?? [];
  const statuses = useQueries({
    queries: list.map((o) => ({
      queryKey: queryKeys.publicOrder(o.reference),
      queryFn: () => publicApi.getOrder(o.reference, o.token),
      staleTime: 60_000,
    })),
  });
  const today = berlinToday();
  const upcoming = list.filter((o) => o.pickupDate >= today);
  const past = list.filter((o) => o.pickupDate < today).reverse();
  const refreshing = statuses.some((s) => s.isRefetching);

  const remove = async (order: SavedOrder) => {
    const ok = await confirmDialog({ title: de.myOrders.removeTitle, message: de.myOrders.removeMessage, confirmLabel: de.myOrders.remove, destructive: true });
    if (!ok) return;
    await cancelReminder(order.reminderId);
    await removeSavedOrder(order.reference);
  };

  const renderOrder = (o: SavedOrder) => {
    const status = statuses[list.indexOf(o)]?.data?.status;
    return (
      <Card key={o.reference} padded={false} style={styles.card}>
        <Pressable
          onPress={() => router.push({ pathname: '/bestellung/[ref]', params: { ref: o.reference } })}
          accessibilityRole="button"
          accessibilityLabel={`${o.bakeryName}, ${formatDateRelative(o.pickupDate, today)} ${formatTimeRange(o.slotStart, o.slotEnd)} ${de.common.clock}, ${o.reference}${status ? `, ${de.status[status]}` : ''}`}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <AppText variant="subheading">{o.bakeryName}</AppText>
            <AppText variant="caption">
              {formatDateRelative(o.pickupDate, today)} · {formatTimeRange(o.slotStart, o.slotEnd)} {de.common.clock}
            </AppText>
            <AppText variant="label" color={colors.accentText}>
              {o.reference}
            </AppText>
            {status ? <OrderStatusBadge status={status} /> : null}
          </View>
          <Icon name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => void remove(o)} accessibilityRole="button" accessibilityLabel={`${de.myOrders.remove}: ${o.reference}`} style={styles.remove}>
          <Icon name="trash" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>
    );
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            reload();
            statuses.forEach((s) => void s.refetch());
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Stack.Screen options={{ title: de.myOrders.title }} />
      {loading ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={de.myOrders.empty}
          text={de.myOrders.emptyHint}
          action={<Button label={de.order.backHome} icon="home" variant="secondary" onPress={() => router.dismissTo('/')} />}
        />
      ) : (
        <>
          {upcoming.length ? (
            <View style={styles.section}>
              <AppText variant="heading" accessibilityRole="header">
                {de.myOrders.upcoming}
              </AppText>
              {upcoming.map(renderOrder)}
            </View>
          ) : null}
          {past.length ? (
            <View style={styles.section}>
              <AppText variant="heading" accessibilityRole="header">
                {de.myOrders.past}
              </AppText>
              {past.map(renderOrder)}
            </View>
          ) : null}
          <AppText variant="caption" center>
            {de.myOrders.savedLocally}
          </AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  pressed: { opacity: 0.85 },
  flex: { flex: 1, gap: spacing.xs },
  remove: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
});
