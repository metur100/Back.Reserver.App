import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, touchTarget } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'md' | 'lg' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const palette: Record<Variant, { bg: string; bgPressed: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, bgPressed: colors.accentPressed, fg: colors.onAccent, border: colors.accent },
  secondary: { bg: colors.surface, bgPressed: colors.surfaceMuted, fg: colors.accentText, border: colors.borderStrong },
  ghost: { bg: 'transparent', bgPressed: colors.surfaceMuted, fg: colors.accentText, border: 'transparent' },
  danger: { bg: colors.surface, bgPressed: colors.dangerSoft, fg: colors.danger, border: colors.danger },
  success: { bg: colors.success, bgPressed: '#2F552D', fg: colors.onAccent, border: colors.success },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const p = palette[variant];
  const isDisabled = disabled || loading;
  const minHeight = size === 'lg' ? 58 : size === 'sm' ? 40 : touchTarget;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight,
          backgroundColor: isDisabled && variant !== 'ghost' ? colors.disabledSoft : pressed ? p.bgPressed : p.bg,
          borderColor: isDisabled ? colors.border : p.border,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={variant === 'primary' || variant === 'success' ? colors.textMuted : p.fg} />
        ) : icon ? (
          <Icon name={icon} size={size === 'lg' ? 22 : 18} color={isDisabled ? colors.textSubtle : p.fg} />
        ) : null}
        <AppText
          variant={size === 'lg' ? 'heading' : size === 'sm' ? 'label' : 'bodyStrong'}
          color={isDisabled ? colors.textMuted : p.fg}
          numberOfLines={2}
          center
        >
          {label}
        </AppText>
        {iconRight && !loading ? <Icon name={iconRight} size={18} color={isDisabled ? colors.textSubtle : p.fg} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
