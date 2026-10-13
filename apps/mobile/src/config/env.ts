import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AppEnv = 'development' | 'preview' | 'production';

interface Extra {
  appEnv?: AppEnv;
  apiUrl?: string | null;
  universalLinkHost?: string;
  eas?: { projectId?: string };
}

const extra: Extra = (Constants.expoConfig?.extra as Extra | undefined) ?? {};

/**
 * Default dev API URLs:
 *  - Android emulator reaches the host machine via 10.0.2.2
 *  - iOS simulator and web use localhost
 *  - physical devices need the LAN IP of the dev machine: set EXPO_PUBLIC_API_URL=http://192.168.x.y:5280
 */
export function defaultDevApiUrl(os: string = Platform.OS): string {
  return os === 'android' ? 'http://10.0.2.2:5280' : 'http://localhost:5280';
}

export function resolveApiUrl(options: { envUrl?: string | null; extraUrl?: string | null; os?: string }): string {
  const url = options.envUrl || options.extraUrl || defaultDevApiUrl(options.os);
  return url.replace(/\/+$/, '');
}

export const env = {
  appEnv: (extra.appEnv ?? 'development') as AppEnv,
  // EXPO_PUBLIC_* variables are inlined at bundle time.
  apiUrl: resolveApiUrl({ envUrl: process.env.EXPO_PUBLIC_API_URL, extraUrl: extra.apiUrl }),
  universalLinkHost: extra.universalLinkHost ?? 'app.backreserve.example',
  easProjectId: extra.eas?.projectId ?? Constants.easConfig?.projectId ?? null,
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
};

/** Image URLs from the API are relative ("/media/demo/x.svg"); prefix them with the API base. */
export function resolveMediaUrl(url: string | null | undefined, base: string = env.apiUrl): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
