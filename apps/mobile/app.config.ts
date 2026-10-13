import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * BackReserve mobile app configuration.
 *
 * Environments are selected with APP_ENV (development | preview | production), set per EAS build profile in eas.json.
 * The API base URL comes from EXPO_PUBLIC_API_URL; when it is not set in development the app picks a platform default
 * at runtime (Android emulator: http://10.0.2.2:5280, iOS simulator / web: http://localhost:5280), see src/config/env.ts.
 *
 * PLACEHOLDERS (replace before a real store release, see docs/STORE_RELEASE.md):
 *  - bundle identifier / Android package "de.backreserve.app"
 *  - universal-link domain "app.backreserve.example"
 *  - API hosts "*.backreserve.example"
 *  - EAS project id (EAS_PROJECT_ID)
 */
type AppEnv = 'development' | 'preview' | 'production';

const APP_ENV: AppEnv = (['development', 'preview', 'production'] as const).includes(process.env.APP_ENV as AppEnv)
  ? (process.env.APP_ENV as AppEnv)
  : 'development';

const DEFAULT_API_URL: Record<AppEnv, string | null> = {
  development: null, // resolved per platform at runtime
  preview: 'https://backreserve.runasp.net',
  production: 'https://backreserve.runasp.net',
};

const UNIVERSAL_LINK_HOST = process.env.UNIVERSAL_LINK_HOST ?? 'app.backreserve.example';
const BUNDLE_ID = 'de.backreserve.app';
const VERSION = '1.0.0';
const BUILD_NUMBER = 1;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_ENV === 'production' ? 'BackReserve' : APP_ENV === 'preview' ? 'BackReserve (Test)' : 'BackReserve (Dev)',
  slug: 'backreserve',
  owner: process.env.EAS_OWNER || undefined,
  scheme: 'backreserve',
  version: VERSION,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FAF6F0',
  primaryColor: '#B5562B',
  ios: {
    bundleIdentifier: APP_ENV === 'production' ? BUNDLE_ID : `${BUNDLE_ID}.${APP_ENV === 'preview' ? 'preview' : 'dev'}`,
    buildNumber: String(BUILD_NUMBER),
    supportsTablet: true,
    requireFullScreen: true,
    associatedDomains: [`applinks:${UNIVERSAL_LINK_HOST}`],
    infoPlist: {
      NSCameraUsageDescription:
        'BackReserve verwendet die Kamera nur, um Abholcodes (QR-Codes) von Reservierungen an der Theke zu scannen.',
      ITSAppUsesNonExemptEncryption: false,
      CFBundleDevelopmentRegion: 'de',
      CFBundleLocalizations: ['de'],
    },
  },
  android: {
    package: APP_ENV === 'production' ? BUNDLE_ID : `${BUNDLE_ID}.${APP_ENV === 'preview' ? 'preview' : 'dev'}`,
    versionCode: BUILD_NUMBER,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
      backgroundColor: '#B5562B',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: UNIVERSAL_LINK_HOST, pathPrefix: '/b/' },
          { scheme: 'https', host: UNIVERSAL_LINK_HOST, pathPrefix: '/bestellung/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-image',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FAF6F0',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'BackReserve verwendet die Kamera nur, um Abholcodes (QR-Codes) von Reservierungen an der Theke zu scannen.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#B5562B',
        defaultChannel: 'default',
        mode: APP_ENV === 'production' ? 'production' : 'development',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    apiUrl: process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL[APP_ENV],
    universalLinkHost: UNIVERSAL_LINK_HOST,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
