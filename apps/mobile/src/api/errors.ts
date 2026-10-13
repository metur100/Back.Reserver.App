import { de } from '@/i18n/de';
import type { ProblemDetails } from './types';

/**
 * Error thrown for every failed API call. `title` is always a German, user-presentable message
 * (taken from the problem+json response or a local fallback); branch on `code`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly problem: ProblemDetails;

  constructor(status: number, code: string, title: string, problem: ProblemDetails = {}) {
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.title = title;
    this.problem = problem;
  }

  get fieldErrors(): Record<string, string[]> {
    return this.problem.errors ?? {};
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** User-facing German message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.title;
  return de.errors.unknown;
}

// ---------- problem+json parsing ----------

function fallbackTitle(status: number): string {
  if (status === 400) return de.errors.validation;
  if (status === 401) return de.errors.sessionExpired;
  if (status === 403) return de.errors.forbidden;
  if (status === 404) return de.errors.notFound;
  if (status === 429) return de.errors.rateLimited;
  return de.errors.unknown;
}

function fallbackCode(status: number): string {
  if (status === 400) return 'validation_failed';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'internal_error' : 'http_error';
}

/** ASP.NET's default model-binding problem uses English titles; only trust German titles from our own handler. */
function looksGerman(title: string): boolean {
  return !/^One or more validation errors occurred\.?$/i.test(title) && !/^(Not Found|Unauthorized|Forbidden|Bad Request)$/i.test(title);
}

export function problemToError(status: number, body: unknown): ApiError {
  const problem: ProblemDetails = body && typeof body === 'object' ? (body as ProblemDetails) : {};
  const rawTitle = typeof problem.title === 'string' ? problem.title : '';
  const title = rawTitle && looksGerman(rawTitle) ? rawTitle : fallbackTitle(status);
  const code = typeof problem.code === 'string' && problem.code ? problem.code : fallbackCode(status);
  return new ApiError(status, code, title, problem);
}

export function networkError(timedOut = false): ApiError {
  return new ApiError(0, timedOut ? 'timeout' : 'network_error', timedOut ? de.errors.timeout : de.errors.network);
}
