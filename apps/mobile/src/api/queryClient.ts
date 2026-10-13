import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { isApiError } from './errors';

/** Retry only transient failures (network, timeouts, 5xx); never 4xx business errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isApiError(error)) return failureCount < 1;
  return error.status === 0 || error.status >= 500;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

let wired = false;
/** Connects React Query to app focus and connectivity (refetch on foreground / reconnect). */
export function wireReactQueryToNative() {
  if (wired || Platform.OS === 'web') return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    }),
  );
  AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
}
