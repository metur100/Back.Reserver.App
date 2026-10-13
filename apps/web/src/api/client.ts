import { t } from '@/i18n';
import type { AuthResponse, ProblemDetails } from './types';

/** API origin. Empty = same origin (dev proxy / reverse proxy). */
export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');

/** Product and branding images are relative ("/media/…"); prefix them with the API origin. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly errors: Record<string, string[]> | undefined;
  readonly problem: ProblemDetails;

  constructor(status: number, problem: ProblemDetails) {
    const title = problem.title ?? t('errors.unexpected');
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code ?? (status === 0 ? 'network_error' : `http_${status}`);
    this.title = title;
    this.errors = problem.errors;
    this.problem = problem;
  }

  get isNetwork() {
    return this.status === 0;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isRateLimited() {
    return this.status === 429;
  }
  get isValidation() {
    return this.status === 400 && !!this.errors;
  }
  get isPlanFeature() {
    return this.code === 'plan_feature_unavailable';
  }
  /** Typed access to RFC 7807 extension members (e.g. remaining, violations). */
  ext<T>(key: string): T | undefined {
    return this.problem[key] as T | undefined;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** User-presentable German message for any error. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.title;
  return t('errors.unexpected');
}

// ---------- Session state (access token in memory only) ----------

type SessionListener = (auth: AuthResponse | null) => void;

let accessToken: string | null = null;
let tenantId: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
const listeners = new Set<SessionListener>();

export const session = {
  getToken: () => accessToken,
  setToken: (token: string | null) => {
    accessToken = token;
  },
  getTenantId: () => tenantId,
  setTenantId: (id: string | null) => {
    tenantId = id;
  },
  subscribe(listener: SessionListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Applies a fresh auth response (login, accept invitation, refresh) and notifies listeners. */
  apply(auth: AuthResponse | null) {
    accessToken = auth?.accessToken ?? null;
    listeners.forEach((l) => l(auth));
  },
};

const REFRESH_PATH = '/api/v1/auth/refresh';

/**
 * Exchanges the HttpOnly refresh cookie for a new access token. Concurrent callers share one request
 * (single flight), so parallel 401s never trigger refresh-token reuse.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}${REFRESH_PATH}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'BackReserve', 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          // Drain the body so the connection is released (an unread body keeps the request pending).
          await res.text().catch(() => undefined);
          session.apply(null);
          return null;
        }
        const auth = (await res.json()) as AuthResponse;
        session.apply(auth);
        return auth;
      } catch {
        // Network failure: keep the current state; callers decide.
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

// ---------- Requests ----------

export type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;

export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)));
    else sp.append(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  /** none = public; user = bearer token; tenant = bearer token + X-Tenant-Id */
  auth?: 'none' | 'user' | 'tenant';
  /** include cookies (auth endpoints) */
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  /** Return the raw Response (e.g. for blob downloads). */
  raw?: boolean;
}

async function toApiError(res: Response): Promise<ApiError> {
  let problem: ProblemDetails = {};
  try {
    const text = await res.text();
    if (text) problem = JSON.parse(text) as ProblemDetails;
  } catch {
    problem = {};
  }
  // ASP.NET model-binding errors come without a stable code and with an English title.
  if (res.status === 400 && !problem.code) {
    problem.code = 'validation_failed';
    problem.title = t('errors.validation');
  }
  if (!problem.title) {
    problem.title =
      res.status === 403
        ? t('errors.forbidden')
        : res.status === 404
          ? t('errors.notFound')
          : res.status === 429
            ? t('errors.rateLimited')
            : res.status === 401
              ? t('errors.sessionExpired')
              : t('errors.unexpected');
  }
  return new ApiError(res.status, problem);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', ...options.headers };
  let body: BodyInit | undefined;
  if (options.formData) body = options.formData;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const auth = options.auth ?? 'none';
  if (auth !== 'none' && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (auth === 'tenant' && tenantId) headers['X-Tenant-Id'] = tenantId;

  try {
    return await fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: options.credentials ?? 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, { title: t('errors.network'), code: 'network_error' });
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options);

  if (res.status === 401 && options.auth && options.auth !== 'none') {
    const refreshed = await refreshSession();
    if (refreshed) res = await send(path, options);
  }

  if (!res.ok) throw await toApiError(res);
  if (options.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  return (type.includes('json') ? JSON.parse(text) : text) as T;
}

/** Idempotency keys must be 8–100 chars; crypto.randomUUID() gives 36. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
