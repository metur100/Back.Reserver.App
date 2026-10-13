import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export function Checkbox({
  checked,
  onChange,
  label,
  error,
  testID,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  error?: string;
  testID?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        testID={testID}
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        accessibilityHint={error}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.checked, !!error && styles.errored]}>
          {checked ? <Icon name="checkmark" size={18} color={colors.onAccent} /> : null}
        </View>
        <AppText style={styles.label}>{label}</AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 44, paddingVertical: spacing.xs },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checked: { backgroundColor: colors.accent, borderColor: colors.accent },
  errored: { borderColor: colors.danger },
  label: { flex: 1 },
});
