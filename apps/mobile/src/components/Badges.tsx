import { StyleSheet, View } from 'react-native';
import type { AvailabilityStatus, OrderStatus } from '@/api/types';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { AppText, Icon, type IconName } from './ui';

function Badge({ label, icon, fg, bg, testID, large }: { label: string; icon: IconName; fg: string; bg: string; testID?: string; large?: boolean }) {
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: bg }, large && styles.large]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={large ? 18 : 14} color={fg} />
      <AppText variant="label" color={fg} style={large ? undefined : styles.smallText} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Availability shown as icon + text, never by colour alone. */
export function AvailabilityBadge({ availability, remaining }: { availability: AvailabilityStatus; remaining: number }) {
  if (availability === 'SoldOut' || remaining <= 0)
    return <Badge testID="availability-soldout" label={de.product.soldOut} icon="close-circle" fg={colors.danger} bg={colors.dangerSoft} />;
  if (availability === 'Low')
    return <Badge testID="availability-low" label={de.product.low(remaining)} icon="hourglass" fg={colors.warning} bg={colors.warningSoft} />;
  return <Badge testID="availability-available" label={de.product.available} icon="checkmark-circle" fg={colors.success} bg={colors.successSoft} />;
}

const statusStyle: Record<OrderStatus, { icon: IconName; fg: string; bg: string }> = {
  Confirmed: { icon: 'receipt', fg: colors.info, bg: colors.infoSoft },
  Preparing: { icon: 'flame', fg: colors.warning, bg: colors.warningSoft },
  ReadyForPickup: { icon: 'bag-handle', fg: colors.success, bg: colors.successSoft },
  Collected: { icon: 'checkmark-done', fg: colors.textMuted, bg: colors.surfaceMuted },
  Cancelled: { icon: 'close-circle', fg: colors.danger, bg: colors.dangerSoft },
  NoShow: { icon: 'alert-circle', fg: colors.danger, bg: colors.dangerSoft },
};

/** Order status with icon + text. `audience="staff"` uses the shorter counter wording ("Neu", "Bereit"). */
export function OrderStatusBadge({ status, audience = 'customer', large }: { status: OrderStatus; audience?: 'customer' | 'staff'; large?: boolean }) {
  const s = statusStyle[status] ?? statusStyle.Confirmed;
  const label = (audience === 'staff' ? de.staffStatus : de.status)[status] ?? status;
  return <Badge testID={`status-${status}`} label={label} icon={s.icon} fg={s.fg} bg={s.bg} large={large} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  large: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  smallText: { fontSize: 13, lineHeight: 17 },
});
