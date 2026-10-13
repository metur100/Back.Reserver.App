import { Pressable, StyleSheet, View } from 'react-native';
import type { PickupSlotDto } from '@/api/types';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { formatTime, formatTimeRange } from '@/utils/format';
import { AppText } from './ui';

function stateLabel(slot: PickupSlotDto): string | null {
  if (slot.available) return slot.remainingOrders > 0 && slot.remainingOrders <= 3 ? de.checkout.slotRemaining(slot.remainingOrders) : null;
  if (slot.unavailableReason === 'full') return de.checkout.slotFull;
  if (slot.unavailableReason === 'too_soon') return de.checkout.slotTooSoon;
  return de.checkout.slotUnavailable;
}

/** Grid of pickup slots; unavailable slots are disabled and labelled with the reason. */
export function SlotGrid({ slots, selected, onSelect }: { slots: PickupSlotDto[]; selected: string | null; onSelect: (start: string) => void }) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {slots.map((slot) => {
        const isSelected = selected === slot.start;
        const label = stateLabel(slot);
        const range = formatTimeRange(slot.start, slot.end);
        return (
          <Pressable
            key={slot.start}
            testID={`slot-${formatTime(slot.start)}`}
            disabled={!slot.available}
            onPress={() => onSelect(slot.start)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: !slot.available, checked: isSelected }}
            accessibilityLabel={de.checkout.slotA11y(
              range,
              isSelected ? de.checkout.slotSelected : (label ?? de.checkout.slotAvailable),
            )}
            style={({ pressed }) => [
              styles.slot,
              !slot.available && styles.disabled,
              isSelected && styles.selected,
              pressed && slot.available && !isSelected && styles.pressed,
            ]}
          >
            <AppText variant="bodyStrong" color={isSelected ? colors.onAccent : slot.available ? colors.text : colors.textSubtle}>
              {range}
            </AppText>
            {label ? (
              <AppText variant="caption" color={isSelected ? colors.onAccent : slot.available ? colors.warning : colors.textSubtle}>
                {label}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 104,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { backgroundColor: colors.disabledSoft, borderStyle: 'dashed' },
  pressed: { backgroundColor: colors.surfaceMuted },
});
