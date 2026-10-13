import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { adminApi } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { OrderAction, OrderDetailDto } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { OrderStatusBadge } from '@/components/Badges';
import { InfoRow, ItemsTable } from '@/components/OrderParts';
import { ReasonDialog } from '@/components/ReasonDialog';
import { OrderHistory } from '@/components/staff/OrderHistory';
import { AppText, Button, Card, ErrorState, ListSkeleton, Notice, Screen } from '@/components/ui';
import { de } from '@/i18n/de';
import { canReportProblem } from '@/staff/actions';
import { useOrderAction, useReportProblem } from '@/staff/useOrderAction';
import { colors, spacing } from '@/theme';
import { confirmDialog, infoDialog } from '@/utils/dialogs';
import { berlinToday, formatDateLong, formatDateTimeShort, formatTimeRange } from '@/utils/format';

const ACTION_ORDER: OrderAction[] = ['prepare', 'ready', 'collect', 'no-show', 'cancel'];

export default function StaffOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tenantId, can } = useAuth();
  const [dialog, setDialog] = useState<'cancel' | 'problem' | null>(null);

  const orderQuery = useQuery({
    queryKey: queryKeys.staff.order(tenantId ?? '', id ?? ''),
    queryFn: () => adminApi.getOrder(id!),
    enabled: !!tenantId && !!id,
    refetchInterval: 30_000,
  });
  const action = useOrderAction({
    onSuccess: (_order, vars) => {
      setDialog(null);
      if (vars.action !== 'collect') return;
      infoDialog(de.staff.actionDone.collect ?? '');
    },
  });
  const problem = useReportProblem({
    onSuccess: () => {
      setDialog(null);
      infoDialog(de.staff.reportProblemDone);
    },
  });

  const run = async (order: OrderDetailDto, a: OrderAction) => {
    if (a === 'cancel') {
      setDialog('cancel');
      return;
    }
    if (a === 'collect' || a === 'no-show') {
      const ok = await confirmDialog({
        title: a === 'collect' ? de.staff.collectTitle : de.staff.noShowTitle,
        message: de.staff.collectMessage(order.publicReference, order.customerName),
        confirmLabel: de.staff.actions[a],
        destructive: a === 'no-show',
      });
      if (!ok) return;
    }
    action.mutate({ id: order.id, action: a });
  };

  const order = orderQuery.data;
  if (!order) {
    return (
      <Screen>
        {orderQuery.isError ? <ErrorState error={orderQuery.error} onRetry={() => void orderQuery.refetch()} /> : <ListSkeleton rows={3} />}
      </Screen>
    );
  }

  const actions = ACTION_ORDER.filter((a) => order.allowedActions.includes(a));
  const showProblem = canReportProblem(can);
  const today = berlinToday();

  return (
    <Screen refreshControl={<RefreshControl refreshing={orderQuery.isRefetching} onRefresh={() => void orderQuery.refetch()} tintColor={colors.accent} />}>
      <Stack.Screen options={{ title: order.publicReference }} />

      <Card style={styles.gap}>
        <View style={styles.row}>
          <AppText variant="title" selectable>
            {order.publicReference}
          </AppText>
          <OrderStatusBadge status={order.status} audience="staff" large />
        </View>
        {order.pickupDate !== today ? <Notice tone="warning">{de.staff.otherDay(formatDateLong(order.pickupDate))}</Notice> : null}
        <InfoRow
          icon="time"
          label={de.order.pickup}
          value={`${formatDateLong(order.pickupDate)}, ${formatTimeRange(order.slotStart, order.slotEnd)} ${de.common.clock}`}
        />
        <InfoRow icon="location" label={de.staff.location} value={order.locationName} />
        <InfoRow icon="person" label={de.staff.customer} value={order.customerName} />
        {order.customerPhone || order.customerEmail ? (
          <View style={styles.contact}>
            {order.customerPhone ? (
              <Button
                label={order.customerPhone}
                icon="call"
                variant="secondary"
                size="sm"
                accessibilityLabel={de.staff.callCustomer(order.customerPhone)}
                onPress={() => void Linking.openURL(`tel:${order.customerPhone!.replace(/[^0-9+]/g, '')}`)}
              />
            ) : null}
            {order.customerEmail ? (
              <Button
                label={order.customerEmail}
                icon="mail"
                variant="secondary"
                size="sm"
                accessibilityLabel={de.staff.mailCustomer(order.customerEmail)}
                onPress={() => void Linking.openURL(`mailto:${order.customerEmail}`)}
              />
            ) : null}
          </View>
        ) : !can('CustomerContactView') ? (
          <AppText variant="caption">{de.staff.contactHidden}</AppText>
        ) : null}
        {order.customerNote ? (
          <Notice tone="warning">
            <AppText variant="label" color={colors.warning}>
              {de.staff.note}
            </AppText>
            <AppText color={colors.warning}>{order.customerNote}</AppText>
          </Notice>
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <AppText variant="heading">{de.order.items}</AppText>
        <ItemsTable
          items={order.items.map((i) => ({ key: i.productId, name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal }))}
          total={order.total}
          currency={order.currency}
        />
        <AppText variant="caption">{de.order.paymentNote}</AppText>
      </Card>

      <Card style={styles.gap}>
        {actions.length === 0 ? <AppText color={colors.textMuted}>{de.staff.noActions}</AppText> : null}
        {order.collectedAt ? <Notice tone="success">{de.staff.collectedAt(formatDateTimeShort(order.collectedAt))}</Notice> : null}
        {order.cancellationReason ? <Notice tone="error">{de.staff.cancelledReason(order.cancellationReason)}</Notice> : null}
        {actions.map((a) => (
          <Button
            key={a}
            label={de.staff.actions[a] ?? a}
            size={a === 'collect' ? 'lg' : 'md'}
            variant={a === 'collect' ? 'success' : a === 'cancel' || a === 'no-show' ? 'danger' : 'primary'}
            icon={a === 'prepare' ? 'flame' : a === 'ready' ? 'bag-handle' : a === 'collect' ? 'checkmark-done' : 'close-circle'}
            loading={action.isPending && action.variables?.action === a}
            disabled={action.isPending}
            onPress={() => void run(order, a)}
            testID={`detail-action-${a}`}
          />
        ))}
        {showProblem ? (
          <Button label={de.staff.reportProblem} icon="warning" variant="secondary" onPress={() => setDialog('problem')} testID="report-problem" />
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <AppText variant="heading">{de.staff.history}</AppText>
        <AppText variant="caption">{de.staff.created(formatDateTimeShort(order.createdAt))}</AppText>
        <OrderHistory history={order.history} />
      </Card>

      {dialog === 'cancel' ? (
        <ReasonDialog
          visible
          title={de.staff.cancelTitle}
          label={de.staff.cancelReason}
          placeholder={de.staff.cancelReasonPlaceholder}
          confirmLabel={de.staff.cancelConfirm}
          loading={action.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => action.mutate({ id: order.id, action: 'cancel', reason })}
        />
      ) : null}
      {dialog === 'problem' ? (
        <ReasonDialog
          visible
          title={de.staff.reportProblemTitle}
          label={de.staff.reportProblemLabel}
          placeholder={de.staff.reportProblemPlaceholder}
          confirmLabel={de.staff.reportProblemConfirm}
          confirmVariant="primary"
          maxLength={450}
          loading={problem.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(note) => problem.mutate({ id: order.id, note })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  contact: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
