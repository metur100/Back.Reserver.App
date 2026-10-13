import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { AppText, Icon } from './ui';

export interface QuantityStepperProps {
  name: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  testID?: string;
}

function tap() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
}

/** Touch-friendly stepper (48pt buttons). Shows a single "Hinzufügen" button while the quantity is 0. */
export function QuantityStepper({ name, value, max, onChange, disabled, testID }: QuantityStepperProps) {
  const canIncrease = !disabled && value < max;
  const canDecrease = !disabled && value > 0;

  if (value === 0) {
    return (
      <Pressable
        testID={testID ? `${testID}-add` : undefined}
        onPress={() => {
          tap();
          onChange(1);
        }}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={de.product.increase(name)}
        accessibilityState={{ disabled: !canIncrease }}
        style={({ pressed }) => [styles.add, !canIncrease && styles.disabled, pressed && canIncrease && styles.addPressed]}
      >
        <Icon name="add" size={20} color={canIncrease ? colors.onAccent : colors.textSubtle} />
        <AppText variant="label" color={canIncrease ? colors.onAccent : colors.textSubtle}>
          {de.product.add}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View
      style={styles.row}
      testID={testID}
      accessibilityRole="adjustable"
      accessibilityLabel={de.product.quantity(name, value)}
      accessibilityValue={{ min: 0, max, now: value }}
      accessibilityActions={[
        { name: 'increment', label: de.product.increase(name) },
        { name: 'decrement', label: de.product.decrease(name) },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && canIncrease) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && canDecrease) onChange(value - 1);
      }}
    >
      <Pressable
        testID={testID ? `${testID}-decrease` : undefined}
        onPress={() => {
          tap();
          onChange(value - 1);
        }}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={de.product.decrease(name)}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        hitSlop={4}
      >
        <Icon name={value === 1 ? 'trash' : 'remove'} size={20} color={colors.accentText} />
      </Pressable>
      <AppText variant="heading" style={styles.value} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </AppText>
      <Pressable
        testID={testID ? `${testID}-increase` : undefined}
        onPress={() => {
          tap();
          onChange(value + 1);
        }}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={canIncrease ? de.product.increase(name) : de.product.maxReached}
        accessibilityState={{ disabled: !canIncrease }}
        style={({ pressed }) => [styles.btn, !canIncrease && styles.btnDisabled, pressed && canIncrease && styles.btnPressed]}
        hitSlop={4}
      >
        <Icon name="add" size={20} color={canIncrease ? colors.accentText : colors.disabled} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  btn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  btnPressed: { backgroundColor: colors.surfaceMuted },
  btnDisabled: { opacity: 0.6 },
  value: { minWidth: 32, textAlign: 'center' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  addPressed: { backgroundColor: colors.accentPressed },
  disabled: { backgroundColor: colors.disabledSoft },
});
