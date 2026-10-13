import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, maxFontScale, radius, spacing, typography } from '@/theme';
import { AppText } from './AppText';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  right?: React.ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, required, right, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <AppText variant="label" nativeID={`${label}-label`}>
        {label}
        {required ? <AppText variant="label" color={colors.accentText}> *</AppText> : null}
      </AppText>
      <View style={[styles.inputRow, focused && styles.focused, !!error && styles.errored]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          aria-invalid={!!error}
          placeholderTextColor={colors.textSubtle}
          maxFontSizeMultiplier={maxFontScale}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption">{hint}</AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  focused: { borderColor: colors.accent },
  errored: { borderColor: colors.danger },
  input: { flex: 1, ...typography.body, paddingVertical: spacing.sm },
});
