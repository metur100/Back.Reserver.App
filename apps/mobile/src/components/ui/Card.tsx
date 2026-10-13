import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme';

export function Card({ style, children, padded = true, ...rest }: ViewProps & { padded?: boolean }) {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  padded: { padding: spacing.lg },
});
