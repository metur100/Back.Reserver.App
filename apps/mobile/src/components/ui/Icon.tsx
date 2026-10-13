import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colors } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Single icon family (Ionicons) for a consistent look. Icons are decorative; pair them with text labels. */
export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: ColorValue }) {
  return <Ionicons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}
