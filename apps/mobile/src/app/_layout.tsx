import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient, wireReactQueryToNative } from '@/api/queryClient';
import { AuthProvider } from '@/auth/AuthContext';
import { OfflineBanner } from '@/components/ui';
import { configureNotifications } from '@/notifications/notifications';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
configureNotifications();
wireReactQueryToNative();

/** Opens the order when a local pickup reminder is tapped. */
function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('backreserve://bestellung/')) {
        const reference = url.replace('backreserve://bestellung/', '').split('?')[0]!;
        router.push({ pathname: '/bestellung/[ref]', params: { ref: reference } });
      }
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  useNotificationNavigation();
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <OfflineBanner />
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
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(staff)/team" options={{ headerShown: false }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
