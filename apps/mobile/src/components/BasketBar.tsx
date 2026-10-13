import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { de } from '@/i18n/de';
import { colors, radius, shadowStrong, spacing } from '@/theme';
import { formatCents } from '@/utils/format';
import { AppText, Icon } from './ui';

/** Sticky bottom bar with item count and total; opens the checkout. */
export function BasketBar({ count, totalCents, onPress }: { count: number; totalCents: number; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  if (count === 0) return null;
  const summary = de.basket.bar(count, formatCents(totalCents));
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Pressable
        testID="basket-bar"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${de.basket.toCheckout}, ${summary}`}
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      >
        <View style={styles.left}>
          <View style={styles.count}>
            <AppText variant="label" color={colors.accentText}>
              {count}
            </AppText>
          </View>
          <AppText variant="bodyStrong" color={colors.onAccent} numberOfLines={1} style={styles.flex}>
            {summary}
          </AppText>
        </View>
        <View style={styles.right}>
          <AppText variant="bodyStrong" color={colors.onAccent}>
            {de.basket.toCheckout}
          </AppText>
          <Icon name="chevron-forward" size={20} color={colors.onAccent} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadowStrong,
  },
  bar: {
    minHeight: 58,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  pressed: { backgroundColor: colors.accentPressed },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  flex: { flex: 1 },
  count: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
