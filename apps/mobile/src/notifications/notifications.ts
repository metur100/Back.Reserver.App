import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { env } from '@/config/env';
import { de } from '@/i18n/de';
import { berlinWallClockToDate, formatTime } from '@/utils/format';

/**
 * Notifications:
 *  - Local reminders ("Abholung in 1 Stunde") are scheduled on the device only.
 *  - Push token registration is implemented (Expo push token), but the backend has no endpoint to store device
 *    tokens yet. Server-sent pushes (e.g. "Neue Bestellung" for staff, "Abholbereit" for customers) are a later
 *    milestone; nothing is faked here.
 */

let configured = false;

export function configureNotifications() {
  if (configured || Platform.OS === 'web') return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Erinnerungen',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#B5562B',
    });
  }
}

export type PermissionResult = 'granted' | 'denied' | 'unavailable';

/** Asks for notification permission (call only in context, e.g. after the user taps "Erinnerung"). */
export async function ensureNotificationPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'web') return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return requested.granted ? 'granted' : 'denied';
}

/** Instant one hour before the pickup slot start (Berlin wall clock). */
export function reminderTime(pickupDate: string, slotStart: string): Date {
  return new Date(berlinWallClockToDate(pickupDate, slotStart).getTime() - 60 * 60_000);
}

export async function schedulePickupReminder(params: {
  reference: string;
  bakeryName: string;
  pickupDate: string;
  slotStart: string;
}): Promise<{ id: string; at: Date } | null> {
  const at = reminderTime(params.pickupDate, params.slotStart);
  if (at.getTime() <= Date.now() + 60_000) return null;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: de.order.reminderTitle,
      body: de.order.reminderBody(params.bakeryName, formatTime(params.slotStart), params.reference),
      data: { url: `backreserve://bestellung/${params.reference}` },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'default' },
  });
  return { id, at };
}

export async function cancelReminder(id: string | null | undefined): Promise<void> {
  if (!id || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or removed
  }
}

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unavailable'; reason: string };

/**
 * Registers this device for push notifications and returns the Expo push token.
 * TODO(backend milestone): POST the token to a future endpoint (e.g. /api/v1/admin/devices) so the server can send
 * "Neue Bestellung" pushes. Until then the token is only shown locally.
 */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (Platform.OS === 'web') return { status: 'unavailable', reason: 'web' };
  if (!Device.isDevice) return { status: 'unavailable', reason: 'simulator' };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return { status: 'unavailable', reason: 'expo-go' };
  const permission = await ensureNotificationPermission();
  if (permission !== 'granted') return { status: 'denied' };
  const projectId = env.easProjectId;
  if (!projectId) return { status: 'unavailable', reason: 'missing-eas-project-id' };
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { status: 'registered', token: token.data };
  } catch (e) {
    return { status: 'unavailable', reason: e instanceof Error ? e.message : 'unknown' };
  }
}
