import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { formatMoney } from '@/utils/format';
import { AppText, Icon, type IconName } from './ui';

export function InfoRow({ icon, label, value, testID }: { icon: IconName; label: string; value: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.infoRow} testID={testID} accessible accessibilityLabel={typeof value === 'string' ? `${label}: ${value}` : undefined}>
      <View style={styles.infoIcon}>
        <Icon name={icon} size={20} color={colors.accentText} />
      </View>
      <View style={styles.flex}>
        <AppText variant="caption">{label}</AppText>
        {typeof value === 'string' ? <AppText variant="bodyStrong">{value}</AppText> : value}
      </View>
    </View>
  );
}

export interface ItemLine {
  key: string;
  name: string;
  quantity: number;
  lineTotal: number;
}

export function ItemsTable({ items, total, currency = 'EUR' }: { items: ItemLine[]; total: number; currency?: string }) {
  return (
    <View style={styles.items}>
      {items.map((item) => (
        <View key={item.key} style={styles.itemRow} accessible accessibilityLabel={`${item.quantity} mal ${item.name}, ${formatMoney(item.lineTotal, currency)}`}>
          <AppText variant="bodyStrong" style={styles.qty}>
            {item.quantity}×
          </AppText>
          <AppText style={styles.flex}>{item.name}</AppText>
          <AppText>{formatMoney(item.lineTotal, currency)}</AppText>
        </View>
      ))}
      <View style={[styles.itemRow, styles.totalRow]} accessible accessibilityLabel={`${de.common.total}: ${formatMoney(total, currency)}`}>
        <AppText variant="heading" style={styles.flex}>
          {de.common.total}
        </AppText>
        <AppText variant="heading">{formatMoney(total, currency)}</AppText>
      </View>
    </View>
  );
}

/** QR code that encodes ONLY the public reference (e.g. "BR-7K4M9X") – never personal data or the access token. */
export function PickupQr({ reference, size = 200 }: { reference: string; size?: number }) {
  return (
    <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel={de.order.qrA11y(reference)}>
      <QRCode value={reference} size={size} color={colors.text} backgroundColor={colors.surface} ecl="M" quietZone={8} />
    </View>
  );
}

export function PickupCode({ reference }: { reference: string }) {
  return (
    <AppText variant="code" center selectable accessibilityLabel={`${de.order.pickupCode}: ${reference.split('').join(' ')}`} testID="pickup-code">
      {reference}
    </AppText>
  );
}

export function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <View
      style={styles.steps}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={de.checkout.stepLabel(current + 1, steps.length, steps[current] ?? '')}
    >
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={step} style={styles.step}>
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              {done ? (
                <Icon name="checkmark" size={14} color={colors.onAccent} />
              ) : (
                <AppText variant="label" color={active ? colors.onAccent : colors.textMuted} style={styles.dotText}>
                  {i + 1}
                </AppText>
              )}
            </View>
            <AppText variant="caption" color={active ? colors.text : colors.textMuted} numberOfLines={1} style={active ? styles.activeLabel : undefined}>
              {step}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  infoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  items: { gap: spacing.sm },
  itemRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  qty: { minWidth: 34 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  qr: { alignSelf: 'center', padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md },
  steps: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  step: { flex: 1, alignItems: 'center', gap: spacing.xs },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.accent },
  dotText: { fontSize: 13, lineHeight: 16 },
  activeLabel: { fontWeight: '700' },
});
