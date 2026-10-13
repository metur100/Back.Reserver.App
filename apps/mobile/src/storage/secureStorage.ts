import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small key-value facade over expo-secure-store (iOS Keychain / Android Keystore-backed encrypted storage).
 * Used for the staff refresh token and saved order capability tokens.
 *
 * Web has no secure enclave; for the optional web preview we fall back to localStorage (documented limitation).
 * Keys may only contain alphanumerics, ".", "-" and "_".
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const webStore: KeyValueStore = {
  async getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // storage full or disabled: ignore
    }
  },
  async removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const nativeStore: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const secureStorage: KeyValueStore = Platform.OS === 'web' ? webStore : nativeStore;

/** In-memory implementation for tests. */
export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    async getItem(key) {
      return key in data ? data[key]! : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}
