import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Icon, Screen, TextField } from '@/components/ui';
import { de } from '@/i18n/de';
import { useSavedOrders } from '@/orders/useSavedOrders';
import { removeRecentBakery, useRecentBakeries } from '@/recent/recentBakeries';
import { colors, radius, spacing } from '@/theme';
import { parseBakeryInput } from '@/utils/links';

export default function HomeScreen() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | undefined>();
  const recent = useRecentBakeries();
  const { orders } = useSavedOrders();

  const open = () => {
    const slug = parseBakeryInput(input);
    if (!slug) {
      setError(de.home.invalidInput);
      return;
    }
    setError(undefined);
    router.push({ pathname: '/b/[slug]', params: { slug } });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Screen edges={[]}>
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
            <AppText variant="heading" color={colors.accentText} accessibilityRole="header">
              {de.common.appName}
            </AppText>
          </View>
          <AppText variant="display">{de.home.title}</AppText>
          <AppText color={colors.textMuted}>{de.home.subtitle}</AppText>
        </View>

        <Card style={styles.gap}>
          <AppText variant="heading">{de.home.openBakery}</AppText>
          <TextField
            label={de.home.inputLabel}
            placeholder={de.home.inputPlaceholder}
            value={input}
            onChangeText={(t) => {
              setInput(t);
              if (error) setError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={open}
            error={error}
            hint={de.home.inputHint}
            testID="bakery-input"
          />
          <Button label={de.home.open} icon="storefront" onPress={open} disabled={!input.trim()} testID="open-bakery" />
        </Card>

        <Pressable
          onPress={() => router.push('/bestellungen')}
          accessibilityRole="button"
          accessibilityLabel={`${de.home.myOrders}, ${de.home.myOrdersHint(orders?.length ?? 0)}`}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card style={styles.linkCard}>
            <View style={styles.linkIcon}>
              <Icon name="receipt" size={24} color={colors.accentText} />
            </View>
            <View style={styles.flex}>
              <AppText variant="subheading">{de.home.myOrders}</AppText>
              <AppText variant="caption">{de.home.myOrdersHint(orders?.length ?? 0)}</AppText>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </Card>
        </Pressable>

        {recent.length > 0 ? (
          <View style={styles.gap}>
            <AppText variant="heading" accessibilityRole="header">
              {de.home.recent}
            </AppText>
            {recent.map((b) => (
              <Card key={b.slug} style={styles.recentCard} padded={false}>
                <Pressable
                  onPress={() => router.push({ pathname: '/b/[slug]', params: { slug: b.slug } })}
                  accessibilityRole="button"
                  accessibilityLabel={b.city ? `${b.name}, ${b.city}` : b.name}
                  style={({ pressed }) => [styles.recentMain, pressed && styles.pressed]}
                >
                  <Icon name="storefront" size={22} color={colors.accentText} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{b.name}</AppText>
                    {b.city ? <AppText variant="caption">{b.city}</AppText> : null}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => void removeRecentBakery(b.slug)}
                  accessibilityRole="button"
                  accessibilityLabel={de.home.removeRecent(b.name)}
                  style={styles.removeBtn}
                  hitSlop={4}
                >
                  <Icon name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </Card>
            ))}
          </View>
        ) : null}

        <Card style={[styles.gap, styles.staffCard]}>
          <View style={styles.brandRow}>
            <Icon name="business" size={22} color={colors.text} />
            <AppText variant="subheading">{de.home.staff}</AppText>
          </View>
          <AppText variant="caption">{de.home.staffHint}</AppText>
          <Button label={de.home.staffLogin} variant="secondary" icon="log-in" onPress={() => router.push('/team')} testID="staff-entry" />
        </Card>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { gap: spacing.sm, paddingTop: spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 40, height: 40, borderRadius: radius.sm },
  gap: { gap: spacing.md },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  recentCard: { flexDirection: 'row', alignItems: 'center' },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: 56 },
  removeBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
  staffCard: { backgroundColor: colors.surfaceMuted },
});
