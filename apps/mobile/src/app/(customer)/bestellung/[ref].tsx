import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { publicApi } from '@/api/client';
import { errorMessage, isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { PublicOrderDto } from '@/api/types';
import { OrderStatusBadge } from '@/components/Badges';
import { InfoRow, ItemsTable, PickupCode, PickupQr } from '@/components/OrderParts';
import { AppText, Button, Card, EmptyState, ErrorState, Icon, ListSkeleton, Notice, Screen } from '@/components/ui';
import { de } from '@/i18n/de';
import { cancelReminder, ensureNotificationPermission, reminderTime, schedulePickupReminder } from '@/notifications/notifications';
import { getSavedOrder, saveOrder, updateSavedOrder, type SavedOrder } from '@/orders/savedOrders';
import { colors, spacing } from '@/theme';
import { confirmDialog, infoDialog } from '@/utils/dialogs';
import { formatDateLong, formatDateTime, formatDateTimeShort, formatTimeRange } from '@/utils/format';
import { normalizePickupCode } from '@/utils/pickupCode';

function savedFromOrder(order: PublicOrderDto, token: string): SavedOrder {
  return {
    reference: order.publicReference,
    token,
    bakeryName: order.bakeryName,
    bakerySlug: order.bakerySlug,
    pickupDate: order.pickupDate,
    slotStart: order.slotStart,
    slotEnd: order.slotEnd,
    savedAt: Date.now(),
  };
}

export default function OrderScreen() {
  const params = useLocalSearchParams<{ ref: string; t?: string; neu?: string }>();
  const reference = normalizePickupCode(params.ref ?? '');
  const linkToken = typeof params.t === 'string' && params.t.length > 10 ? params.t : null;
  const isNew = params.neu === '1';
  const queryClient = useQueryClient();

  const [saved, setSaved] = useState<SavedOrder | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void getSavedOrder(reference).then((s) => active && setSaved(s));
    return () => {
      active = false;
    };
  }, [reference]);
  const token = linkToken ?? saved?.token ?? null;

  const orderQuery = useQuery({
    queryKey: queryKeys.publicOrder(reference),
    queryFn: () => publicApi.getOrder(reference, token!),
    enabled: !!token,
    staleTime: 15_000,
  });
  const order = orderQuery.data;

  // Orders opened via a confirmation link are remembered under "Meine Bestellungen".
  useEffect(() => {
    if (order && linkToken && saved !== undefined && saved?.token !== linkToken) {
      const entry = savedFromOrder(order, linkToken);
      void saveOrder(entry).then(() => setSaved((s) => ({ ...entry, reminderId: s?.reminderId ?? null })));
    }
  }, [order, linkToken, saved]);

  const cancelMutation = useMutation({
    mutationFn: () => publicApi.cancelOrder(reference, token!),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.publicOrder(reference), updated);
      await cancelReminder(saved?.reminderId);
      await updateSavedOrder(reference, { reminderId: null });
      setSaved((s) => (s ? { ...s, reminderId: null } : s));
      infoDialog(de.order.cancelled);
    },
    onError: (error) => {
      infoDialog(errorMessage(error));
      void orderQuery.refetch();
    },
  });

  const onCancel = async () => {
    const ok = await confirmDialog({ title: de.order.cancelTitle, message: de.order.cancelMessage, confirmLabel: de.order.cancelConfirm, destructive: true });
    if (ok) cancelMutation.mutate();
  };

  const [reminderBusy, setReminderBusy] = useState(false);
  const toggleReminder = async () => {
    if (!order) return;
    setReminderBusy(true);
    try {
      if (saved?.reminderId) {
        await cancelReminder(saved.reminderId);
        await updateSavedOrder(reference, { reminderId: null });
        setSaved({ ...saved, reminderId: null });
        return;
      }
      if (reminderTime(order.pickupDate, order.slotStart).getTime() <= Date.now() + 60_000) {
        infoDialog(de.order.reminderPast);
        return;
      }
      // Ask for permission in context, with an explanation first.
      const explained = await confirmDialog({ title: de.order.reminderPermissionTitle, message: de.order.reminderPermissionMessage, confirmLabel: de.common.ok });
      if (!explained) return;
      const permission = await ensureNotificationPermission();
      if (permission !== 'granted') {
        const open = await confirmDialog({ title: de.order.reminderDenied, confirmLabel: de.order.openSettings });
        if (open) void Linking.openSettings();
        return;
      }
      const scheduled = await schedulePickupReminder({
        reference,
        bakeryName: order.bakeryName,
        pickupDate: order.pickupDate,
        slotStart: order.slotStart,
      });
      if (!scheduled) {
        infoDialog(de.order.reminderPast);
        return;
      }
      if (!saved && token) await saveOrder(savedFromOrder(order, token));
      await updateSavedOrder(reference, { reminderId: scheduled.id });
      setSaved((s) => ({ ...(s ?? savedFromOrder(order, token ?? '')), reminderId: scheduled.id }));
    } catch (e) {
      infoDialog(errorMessage(e));
    } finally {
      setReminderBusy(false);
    }
  };

  const title = isNew ? de.order.successTitle : reference;

  if (saved === undefined && !linkToken && !order) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <ListSkeleton rows={2} />
      </Screen>
    );
  }

  if (!token && !order) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="link" title={reference} text={de.order.tokenMissing} />
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        {orderQuery.isError ? (
          <ErrorState error={orderQuery.error} title={de.order.loadError} onRetry={() => void orderQuery.refetch()} />
        ) : (
          <ListSkeleton rows={3} />
        )}
      </Screen>
    );
  }

  const active = order.status !== 'Cancelled' && order.status !== 'Collected' && order.status !== 'NoShow';
  const reminderAt = saved?.reminderId ? formatDateTimeShort(reminderTime(order.pickupDate, order.slotStart)) : null;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={orderQuery.isRefetching} onRefresh={() => void orderQuery.refetch()} tintColor={colors.accent} />}
    >
      <Stack.Screen options={{ title, headerBackVisible: !isNew }} />

      {isNew ? (
        <View style={styles.success} accessibilityLiveRegion="polite">
          <View style={styles.successIcon}>
            <Icon name="checkmark-circle" size={44} color={colors.success} />
          </View>
          <AppText variant="title" center accessibilityRole="header">
            {de.order.successTitle}
          </AppText>
          <AppText center color={colors.textMuted}>
            {de.order.successSubtitle}
          </AppText>
        </View>
      ) : null}

      {orderQuery.isError ? <Notice tone="warning">{errorMessage(orderQuery.error)}</Notice> : null}

      <Card style={styles.codeCard}>
        <View style={styles.statusRow}>
          <AppText variant="label">{de.order.status}</AppText>
          <OrderStatusBadge status={order.status} large />
        </View>
        <AppText variant="label" center>
          {de.order.pickupCode}
        </AppText>
        <PickupCode reference={order.publicReference} />
        {active ? (
          <>
            <PickupQr reference={order.publicReference} />
            <AppText variant="caption" center>
              {de.order.pickupCodeHint}
            </AppText>
          </>
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <AppText variant="heading">{order.bakeryName}</AppText>
        <InfoRow
          icon="calendar"
          label={de.order.pickup}
          value={`${formatDateLong(order.pickupDate)}\n${formatTimeRange(order.slotStart, order.slotEnd)} ${de.common.clock}`}
        />
        <InfoRow
          icon="location"
          label={de.order.location}
          value={`${order.location.name}\n${order.location.street}, ${order.location.postalCode} ${order.location.city}`}
        />
        {order.location.phone ? (
          <Button
            label={order.location.phone}
            icon="call"
            variant="ghost"
            size="sm"
            accessibilityLabel={de.bakery.call(order.location.phone)}
            onPress={() => void Linking.openURL(`tel:${order.location.phone!.replace(/[^0-9+]/g, '')}`)}
            style={styles.alignStart}
          />
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <AppText variant="heading">{de.order.items}</AppText>
        <ItemsTable
          items={order.items.map((i, idx) => ({ key: `${idx}`, name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal }))}
          total={order.total}
          currency={order.currency}
        />
        <Notice tone="success">{de.checkout.payAtPickup}</Notice>
        {order.customerNote ? <InfoRow icon="document-text" label={de.order.note} value={order.customerNote} /> : null}
      </Card>

      {order.pickupInstructions ? (
        <Card style={styles.gapSm}>
          <AppText variant="label">{de.order.instructions}</AppText>
          <AppText>{order.pickupInstructions}</AppText>
        </Card>
      ) : null}

      <Card style={styles.gap}>
        {order.status === 'Cancelled' && order.cancelledAt ? (
          <Notice tone="error">{de.order.cancelledAt(formatDateTime(order.cancelledAt))}</Notice>
        ) : order.canCancel ? (
          <AppText>{de.order.cancellationDeadline(formatDateTime(order.cancellationDeadline))}</AppText>
        ) : active ? (
          <AppText color={colors.textMuted}>{de.order.cancellationClosed}</AppText>
        ) : null}
        {order.cancellationPolicyText ? <AppText variant="caption">{order.cancellationPolicyText}</AppText> : null}

        {active && Platform.OS !== 'web' ? (
          <View style={styles.gapSm}>
            {reminderAt ? <Notice tone="info">{de.order.reminderSet(reminderAt)}</Notice> : null}
            <Button
              label={saved?.reminderId ? de.order.reminderRemove : de.order.reminder}
              icon="notifications"
              variant="secondary"
              loading={reminderBusy}
              onPress={() => void toggleReminder()}
            />
          </View>
        ) : null}

        {order.canCancel && order.status !== 'Cancelled' ? (
          <Button label={de.order.cancel} icon="close-circle" variant="danger" loading={cancelMutation.isPending} onPress={() => void onCancel()} testID="cancel-order" />
        ) : null}
      </Card>

      {isNew ? (
        <Button label={de.order.backHome} icon="home" variant="ghost" onPress={() => router.dismissTo('/')} />
      ) : null}
      {isApiError(orderQuery.error) && orderQuery.error.status === 404 ? <Notice tone="error">{de.order.tokenMissing}</Notice> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  success: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  codeCard: { gap: spacing.md, alignItems: 'stretch' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.sm },
  alignStart: { alignSelf: 'flex-start' },
});
