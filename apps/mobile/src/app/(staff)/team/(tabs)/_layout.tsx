import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { AppText, Icon } from '@/components/ui';
import { de } from '@/i18n/de';
import { colors } from '@/theme';

/** Staff tabs. Requires a signed-in user with a selected bakery (tenant). */
export default function StaffTabsLayout() {
  const { status, tenantId } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.center} accessibilityLabel={de.auth.restoring}>
        <ActivityIndicator color={colors.accent} size="large" />
        <AppText color={colors.textMuted}>{de.auth.restoring}</AppText>
      </View>
    );
  }
  if (status === 'signedOut') return <Redirect href="/team/anmelden" />;
  if (!tenantId) return <Redirect href="/team/baeckerei" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: de.staff.tabToday, tabBarIcon: ({ color, size }) => <Icon name="today" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="abholung"
        options={{ title: de.staff.tabPickup, tabBarIcon: ({ color, size }) => <Icon name="qr-code" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="konto"
        options={{ title: de.staff.tabAccount, tabBarIcon: ({ color, size }) => <Icon name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
});
