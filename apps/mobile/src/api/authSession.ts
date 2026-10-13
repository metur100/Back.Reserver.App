import { ApiError } from './errors';
import { httpRequest, type FetchFn, type RequestOptions } from './http';
import type { AuthResponse, MeDto } from './types';
import type { KeyValueStore } from '@/storage/secureStorage';

export const REFRESH_TOKEN_KEY = 'br.auth.refreshToken';
const MOBILE_HEADERS = { 'X-Client-Type': 'mobile' } as const;
/** Refresh slightly before expiry to avoid sending tokens that expire in flight. */
const EXPIRY_SKEW_MS = 30_000;

export interface AuthSessionOptions {
  baseUrl: () => string;
  storage: KeyValueStore;
  fetchFn?: FetchFn;
  now?: () => number;
  /** Called when the refresh token is rejected (expired, revoked or reused) and the user must sign in again. */
  onSessionExpired?: () => void;
}

/**
 * Staff authentication for native clients.
 *
 * - The access token lives only in memory; the rotating refresh token is stored in SecureStore.
 * - Refresh tokens are single-use with reuse detection on the server, so refreshes are single-flight: concurrent
 *   callers share one in-flight refresh promise and the rotated refresh token is persisted before anyone proceeds.
 * - Authorised requests refresh proactively before expiry and retry once after a 401.
 */
export class AuthSession {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private refreshInFlight: Promise<AuthResponse | null> | null = null;
  private readonly fetchFn?: FetchFn;
  private readonly now: () => number;

  constructor(private readonly options: AuthSessionOptions) {
    this.fetchFn = options.fetchFn;
    this.now = options.now ?? (() => Date.now());
  }

  get hasAccessToken(): boolean {
    return this.accessToken !== null && this.accessTokenExpiresAt - EXPIRY_SKEW_MS > this.now();
  }

  private accept(response: AuthResponse): Promise<void> {
    this.accessToken = response.accessToken;
    this.accessTokenExpiresAt = Date.parse(response.accessTokenExpiresAt) || this.now() + 5 * 60_000;
    return response.refreshToken
      ? this.options.storage.setItem(REFRESH_TOKEN_KEY, response.refreshToken)
      : Promise.resolve();
  }

  private async clearLocal(): Promise<void> {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    await this.options.storage.removeItem(REFRESH_TOKEN_KEY);
  }

  async login(email: string, password: string): Promise<MeDto> {
    const response = await httpRequest<AuthResponse>(
      this.options.baseUrl(),
      '/api/v1/auth/login',
      { method: 'POST', body: { email: email.trim(), password }, headers: { ...MOBILE_HEADERS } },
      this.fetchFn,
    );
    await this.accept(response);
    return response.user;
  }

  /** Restores a session on app start from the stored refresh token. Returns null when signed out. */
  async restore(): Promise<MeDto | null> {
    const response = await this.refresh();
    return response?.user ?? null;
  }

  /** Single-flight refresh. Resolves null when there is no valid session (refresh token missing or rejected). */
  refresh(): Promise<AuthResponse | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<AuthResponse | null> {
    const refreshToken = await this.options.storage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.accessToken = null;
      return null;
    }
    try {
      const response = await httpRequest<AuthResponse>(
        this.options.baseUrl(),
        '/api/v1/auth/refresh',
        { method: 'POST', body: { refreshToken }, headers: { ...MOBILE_HEADERS } },
        this.fetchFn,
      );
      await this.accept(response);
      return response;
    } catch (e) {
      // Network problems keep the stored token so the user stays signed in once connectivity returns.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 400)) {
        await this.clearLocal();
        this.options.onSessionExpired?.();
        return null;
      }
      throw e;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = await this.options.storage.getItem(REFRESH_TOKEN_KEY);
    await this.clearLocal();
    if (!refreshToken) return;
    try {
      await httpRequest<void>(
        this.options.baseUrl(),
        '/api/v1/auth/logout',
        { method: 'POST', body: { refreshToken }, headers: { ...MOBILE_HEADERS } },
        this.fetchFn,
      );
    } catch {
      // Local sign-out already happened; the server token expires on its own.
    }
  }

  private async getValidAccessToken(): Promise<string> {
    if (this.hasAccessToken) return this.accessToken!;
    const refreshed = await this.refresh();
    if (!refreshed) throw new ApiError(401, 'unauthorized', 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
    return refreshed.accessToken;
  }

  /** Performs an authorised request (Bearer token), refreshing before expiry and retrying once after a 401. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const send = (token: string) =>
      httpRequest<T>(
        this.options.baseUrl(),
        path,
        { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } },
        this.fetchFn,
      );

    const token = await this.getValidAccessToken();
    try {
      return await send(token);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      // Token was rejected (e.g. security stamp changed or expired early). Refresh once - unless another caller
      // already rotated it, in which case reuse the new access token.
      if (this.accessToken && this.accessToken !== token && this.hasAccessToken) return send(this.accessToken);
      this.accessToken = null;
      const refreshed = await this.refresh();
      if (!refreshed) throw e;
      return send(refreshed.accessToken);
    }
  }

  me(): Promise<MeDto> {
    return this.request<MeDto>('/api/v1/auth/me');
  }
}
