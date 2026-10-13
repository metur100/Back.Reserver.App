import { Alert, Platform } from 'react-native';
import { de } from '@/i18n/de';

/** Confirmation dialog returning a promise; uses window.confirm on web where Alert buttons are unsupported. */
export function confirmDialog(options: { title: string; message?: string; confirmLabel?: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    return Promise.resolve(typeof globalThis.confirm === 'function' ? globalThis.confirm(text) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: de.common.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: options.confirmLabel ?? de.common.confirm, style: options.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function infoDialog(title: string, message?: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
