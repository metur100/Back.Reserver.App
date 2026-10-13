import { createAdminApi } from './adminApi';
import { AuthSession } from './authSession';
import { createPublicApi } from './publicApi';
import { env } from '@/config/env';
import { secureStorage } from '@/storage/secureStorage';

/** App-wide API singletons. The tenant id is set by the auth context when a bakery is selected. */
let currentTenantId: string | null = null;
let sessionExpiredListener: (() => void) | null = null;

export function setCurrentTenantId(id: string | null) {
  currentTenantId = id;
}

export function onSessionExpired(listener: (() => void) | null) {
  sessionExpiredListener = listener;
}

const baseUrl = () => env.apiUrl;

export const authSession = new AuthSession({
  baseUrl,
  storage: secureStorage,
  onSessionExpired: () => sessionExpiredListener?.(),
});

export const publicApi = createPublicApi(baseUrl);
export const adminApi = createAdminApi(authSession, () => currentTenantId);
