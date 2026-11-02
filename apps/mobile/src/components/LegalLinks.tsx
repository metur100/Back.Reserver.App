import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { legalUrls, type LegalLinkKey } from '@/config/legal';
import { de } from '@/i18n/de';
import { colors, spacing } from '@/theme';

const DEFAULT_LINKS: readonly LegalLinkKey[] = ['privacy', 'imprint'];

/** Opens a legal/help page of the BackReserve website in the system browser. */
export function openLegalPage(key: LegalLinkKey): Promise<void> {
  return Linking.openURL(legalUrls[key]).catch(() => undefined);
}

/** Small row of text links to the privacy policy, imprint and (optionally) help / account deletion pages. */
export function LegalLinks({ links = DEFAULT_LINKS, center = true }: { links?: readonly LegalLinkKey[]; center?: boolean }) {
  return (
    <View style={[styles.row, center && styles.center]}>
      {links.map((key) => (
        <Pressable
          key={key}
          onPress={() => void openLegalPage(key)}
          accessibilityRole="link"
          accessibilityLabel={de.legal.a11y(de.legal[key])}
          hitSlop={8}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          testID={`legal-${key}`}
        >
          <AppText variant="caption" color={colors.accentText} style={styles.underline}>
            {de.legal[key]}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs },
  center: { justifyContent: 'center' },
  link: { minHeight: 32, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  underline: { textDecorationLine: 'underline' },
});
