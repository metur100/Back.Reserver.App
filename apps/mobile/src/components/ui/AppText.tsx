import { Text, type TextProps } from 'react-native';
import { maxFontScale, typography } from '@/theme';

export type TextVariant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  center?: boolean;
}

/** Text with design-system typography; honours dynamic type up to a sensible cap. */
export function AppText({ variant = 'body', color, center, style, maxFontSizeMultiplier, ...rest }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxFontScale}
      style={[typography[variant], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}
      {...rest}
    />
  );
}
