import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View, type TextInput } from 'react-native';
import { adminApi } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { OrderDetailDto } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { OrderStatusBadge } from '@/components/Badges';
import { InfoRow, ItemsTable } from '@/components/OrderParts';
import { ReasonDialog } from '@/components/ReasonDialog';
import { QrScanner } from '@/components/staff/QrScanner';
import { AppText, Button, Card, ErrorState, Icon, Notice, Screen, TextField } from '@/components/ui';
import { de } from '@/i18n/de';
import { canReportProblem } from '@/staff/actions';
import { useOrderAction, useReportProblem } from '@/staff/useOrderAction';
import { colors, spacing } from '@/theme';
import { confirmDialog, infoDialog } from '@/utils/dialogs';
import { berlinToday, formatDateLong, formatDateTimeShort, formatTimeRange } from '@/utils/format';
import { extractPickupCode, isValidPickupCode, normalizePickupCode } from '@/utils/pickupCode';

export default function PickupScreen() {
  const { can } = useAuth();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [collected, setCollected] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const lookup = useMutation({
    mutationFn: (c: string) => adminApi.lookup(c),
    onSuccess: (o) => {
      setOrder(o);
      setCollected(false);
    },
  });
  const collect = useOrderAction({
    onSuccess: (o) => {
      setOrder(o);
      setCollected(true);
    },
    // e.g. 409 "bereits abgeholt": reload the order so the current status is shown next to the message.
    onError: (error) => {
      if (isApiError(error) && error.status === 409 && order) void adminApi.getOrder(order.id).then(setOrder).catch(() => undefined);
    },
    silent: true,
  });
  const problem = useReportProblem({
    onSuccess: (o) => {
      setOrder(o);
      setProblemOpen(false);
      infoDialog(de.staff.reportProblemDone);
    },
  });

  const search = (raw: string) => {
    if (!isValidPickupCode(raw)) return;
    setScanError(null);
    setOrder(null);
    collect.reset();
    lookup.mutate(normalizePickupCode(raw));
  };

  const onScanned = (data: string) => {
    setScanning(false);
    const extracted = extractPickupCode(data);
    if (!extracted) {
      setScanError(de.staff.codeInvalid);
      return;
    }
    setCode(extracted);
    search(extracted);
  };

  const reset = () => {
    setCode('');
    setOrder(null);
    setCollected(false);
    setScanError(null);
    lookup.reset();
    collect.reset();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const markCollected = async () => {
    if (!order) return;
    const ok = await confirmDialog({
      title: de.staff.collectTitle,
      message: de.staff.collectMessage(order.publicReference, order.customerName),
      confirmLabel: de.staff.collectConfirm,
    });
    if (ok) collect.mutate({ id: order.id, action: 'collect' });
  };

  const normalized = code.trim() ? normalizePickupCode(code) : '';
  const valid = isValidPickupCode(code);
  const canCollect = !!order?.allowedActions.includes('collect');
  const today = berlinToday();

  return (
    <Screen>
      <View style={styles.gapSm}>
        <AppText variant="title" accessibilityRole="header">
          {de.staff.pickupTitle}
        </AppText>
        <AppText color={colors.textMuted}>{de.staff.pickupHint}</AppText>
      </View>

      {!order && !collected ? (
        <Card style={styles.gap}>
          <TextField
            ref={inputRef}
            label={de.staff.codeLabel}
            placeholder={de.staff.codePlaceholder}
            value={code}
            onChangeText={(t) => {
              setCode(t);
              lookup.reset();
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="search"
            onSubmitEditing={() => search(code)}
            hint={normalized && valid ? de.staff.codeNormalized(normalized) : normalized ? de.staff.codeInvalid : undefined}
            style={styles.codeInput}
            maxLength={16}
            testID="pickup-code-input"
          />
          <Button label={de.staff.lookup} icon="search" size="lg" disabled={!valid} loading={lookup.isPending} onPress={() => search(code)} testID="pickup-lookup" />
          {Platform.OS !== 'web' && !scanning ? (
            <Button label={de.staff.scan} icon="scan" variant="secondary" size="lg" onPress={() => setScanning(true)} testID="pickup-scan" />
          ) : null}
        </Card>
      ) : null}

      {scanning ? <QrScanner onScanned={onScanned} onClose={() => setScanning(false)} /> : null}
      {scanError ? <Notice tone="warning">{scanError}</Notice> : null}
      {lookup.isError ? <ErrorState error={lookup.error} onRetry={() => search(code)} /> : null}

      {order ? (
        <Card style={styles.gap}>
          {collected ? (
            <View style={styles.success} accessibilityLiveRegion="assertive">
              <Icon name="checkmark-circle" size={56} color={colors.success} />
              <AppText variant="title" center color={colors.success}>
                {de.staff.collectedSuccess}
              </AppText>
            </View>
          ) : null}
          <View style={styles.row}>
            <AppText variant="title" selectable>
              {order.publicReference}
            </AppText>
            <OrderStatusBadge status={order.status} audience="staff" large />
          </View>
          <AppText variant="heading">{order.customerName}</AppText>
          {order.pickupDate !== today ? <Notice tone="warning">{de.staff.otherDay(formatDateLong(order.pickupDate))}</Notice> : null}
          {order.status === 'Cancelled' ? <Notice tone="error">{de.staff.orderCancelled}</Notice> : null}
          {order.status === 'NoShow' ? <Notice tone="error">{de.staff.orderNoShow}</Notice> : null}
          {order.status === 'Collected' && !collected && order.collectedAt ? (
            <Notice tone="warning">{de.staff.alreadyCollected(formatDateTimeShort(order.collectedAt))}</Notice>
          ) : null}
          <InfoRow icon="time" label={de.order.pickup} value={`${formatTimeRange(order.slotStart, order.slotEnd)} ${de.common.clock} · ${order.locationName}`} />
          <ItemsTable
            items={order.items.map((i) => ({ key: i.productId, name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal }))}
            total={order.total}
            currency={order.currency}
          />
          <AppText variant="caption">{de.order.paymentNote}</AppText>
          {order.customerNote ? <Notice tone="warning">{order.customerNote}</Notice> : null}
          {collect.isError ? <ErrorState error={collect.error} /> : null}

          {!collected && canCollect ? (
            <Button
              label={de.staff.markCollected}
              icon="checkmark-done"
              variant="success"
              size="lg"
              loading={collect.isPending}
              onPress={() => void markCollected()}
              testID="pickup-collect"
            />
          ) : null}
          {!collected && !canCollect && order.status !== 'Collected' && order.status !== 'Cancelled' && order.status !== 'NoShow' && !can('PickupCollect') ? (
            <Notice tone="info">{de.staff.notAllowedCollect}</Notice>
          ) : null}
          {canReportProblem(can) ? (
            <Button label={de.staff.reportProblem} icon="warning" variant="secondary" onPress={() => setProblemOpen(true)} testID="pickup-problem" />
          ) : null}
          <Button
            label={de.staff.detailTitle}
            icon="document-text"
            variant="ghost"
            onPress={() => router.push({ pathname: '/team/bestellung/[id]', params: { id: order.id } })}
          />
          <Button label={de.staff.nextCustomer} icon="arrow-forward" variant={collected ? 'primary' : 'secondary'} size="lg" onPress={reset} testID="pickup-next" />
        </Card>
      ) : null}

      {problemOpen && order ? (
        <ReasonDialog
          visible
          title={de.staff.reportProblemTitle}
          label={de.staff.reportProblemLabel}
          placeholder={de.staff.reportProblemPlaceholder}
          confirmLabel={de.staff.reportProblemConfirm}
          confirmVariant="primary"
          maxLength={450}
          loading={problem.isPending}
          onCancel={() => setProblemOpen(false)}
          onConfirm={(note) => problem.mutate({ id: order.id, note })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  codeInput: { fontSize: 24, letterSpacing: 2, fontWeight: '700' },
  success: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
});
