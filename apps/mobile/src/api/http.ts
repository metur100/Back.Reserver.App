import { networkError, problemToError } from './errors';

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Builds a query string; arrays repeat the key (productIds=a&productIds=b) as ASP.NET expects. */
export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

const DEFAULT_TIMEOUT = 15_000;

/**
 * Minimal JSON HTTP client: adds JSON headers, enforces a timeout, parses problem+json into ApiError and maps
 * connectivity failures to a German network error (status 0).
 */
export async function httpRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
  fetchFn: FetchFn = (input, init) => fetch(input, init),
): Promise<T> {
  const url = `${baseUrl}${path}${buildQuery(options.query)}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', ...options.headers };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetchFn(url, { method: options.method ?? 'GET', headers, body, signal: controller.signal });
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw networkError(timedOut);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text().catch(() => '');
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  if (!response.ok) throw problemToError(response.status, json);
  return json as T;
}
