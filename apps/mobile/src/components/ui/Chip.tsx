import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface ChipProps {
  label: string;
  sublabel?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
  testID?: string;
}

/** Selectable chip (date, category, filter). Selection is conveyed by colour, a check icon and accessibilityState. */
export function Chip({ label, sublabel, selected, disabled, onPress, icon, accessibilityLabel, testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sublabel ? `${label}, ${sublabel}` : label)}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !selected && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        {selected ? <Icon name="checkmark-circle" size={16} color={colors.onAccent} /> : icon ? <Icon name={icon} size={16} color={disabled ? colors.textSubtle : colors.accentText} /> : null}
        <AppText variant="label" color={selected ? colors.onAccent : disabled ? colors.textSubtle : colors.text} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      {sublabel ? (
        <AppText variant="caption" color={selected ? colors.onAccent : disabled ? colors.textSubtle : colors.textMuted} numberOfLines={1} style={styles.sub}>
          {sublabel}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { backgroundColor: colors.disabledSoft, borderColor: colors.border, borderStyle: 'dashed' },
  pressed: { backgroundColor: colors.surfaceMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sub: { fontSize: 12, lineHeight: 16 },
});
