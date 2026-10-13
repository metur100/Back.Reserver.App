import { Stack } from 'expo-router';
import { de } from '@/i18n/de';
import { colors } from '@/theme';

/** Staff area. Authentication and tenant selection are enforced in (tabs)/_layout.tsx. */
export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accentText,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="anmelden" options={{ title: de.auth.title }} />
      <Stack.Screen name="baeckerei" options={{ title: de.auth.chooseTenant }} />
      <Stack.Screen name="bestellung/[id]" options={{ title: de.staff.detailTitle }} />
    </Stack>
  );
}
