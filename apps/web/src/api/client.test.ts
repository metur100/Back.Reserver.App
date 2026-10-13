import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, request, session } from './client';
import type { AuthResponse } from './types';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' } });

const auth = (token: string): AuthResponse => ({
  accessToken: token,
  accessTokenExpiresAt: '2026-10-13T10:00:00Z',
  refreshToken: null,
  user: { userId: 'u1', email: 'a@b.de', firstName: 'A', lastName: 'B', isPlatformAdmin: false, memberships: [] },
});

afterEach(() => {
  vi.unstubAllGlobals();
  session.setToken(null);
  session.setTenantId(null);
});

describe('buildQuery', () => {
  it('repeats array parameters and skips empty values', () => {
    expect(buildQuery({ status: ['Confirmed', 'Preparing'], search: '', page: 2, x: undefined })).toBe('?status=Confirmed&status=Preparing&page=2');
  });
});

describe('request', () => {
  it('maps RFC 7807 problems to ApiError with code, title and extensions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { status: 409, title: 'Nur noch 2 Stück.', code: 'insufficient_stock', productId: 'p1', remaining: 2 })));
    const error = await request('/api/v1/public/orders', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const e = error as ApiError;
    expect(e.code).toBe('insufficient_stock');
    expect(e.title).toBe('Nur noch 2 Stück.');
    expect(e.ext<number>('remaining')).toBe(2);
  });

  it('turns network failures into a German network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const error = (await request('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.isNetwork).toBe(true);
    expect(error.title).toMatch(/Keine Verbindung/);
  });

  it('sends bearer token and tenant header for admin requests', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    session.setToken('tok');
    session.setTenantId('tenant-1');
    await request('/api/v1/admin/dashboard', { auth: 'tenant' });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-Tenant-Id']).toBe('tenant-1');
  });

  it('refreshes once on 401 (single flight for concurrent requests) and retries', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        expect((init?.headers as Record<string, string>)['X-Requested-With']).toBe('BackReserve');
        expect(init?.credentials).toBe('include');
        await new Promise((r) => setTimeout(r, 10));
        return json(200, auth('new-token'));
      }
      const header = (init?.headers as Record<string, string>).Authorization;
      return header === 'Bearer new-token' ? json(200, { ok: true }) : json(401, { status: 401, title: 'Anmeldung erforderlich.' });
    });
    vi.stubGlobal('fetch', fetchMock);
    session.setToken('expired');
    const results = await Promise.all([request('/api/a', { auth: 'user' }), request('/api/b', { auth: 'user' })]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(session.getToken()).toBe('new-token');
  });

  it('logs out when the refresh fails', async () => {
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('/auth/refresh') ? json(401, { title: 'Sitzung abgelaufen.' }) : json(401, { title: 'Anmeldung erforderlich.' }))),
    );
    session.setToken('expired');
    const error = (await request('/api/a', { auth: 'user' }).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(401);
    expect(listener).toHaveBeenCalledWith(null);
    expect(session.getToken()).toBeNull();
    unsubscribe();
  });
});
