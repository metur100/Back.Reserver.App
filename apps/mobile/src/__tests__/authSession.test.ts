import { AuthSession, REFRESH_TOKEN_KEY } from '@/api/authSession';
import { ApiError } from '@/api/errors';
import type { FetchFn } from '@/api/http';
import type { AuthResponse, MeDto } from '@/api/types';
import { createMemoryStore } from '@/storage/secureStorage';

const me: MeDto = { userId: 'u1', email: 'team@rheinblick.example', firstName: 'Mia', lastName: 'Hoffmann', isPlatformAdmin: false, memberships: [] };
const NOW = Date.parse('2026-10-13T08:00:00Z');

function auth(n: number, expiresInMs = 15 * 60_000): AuthResponse {
  return { accessToken: `access-${n}`, accessTokenExpiresAt: new Date(NOW + expiresInMs).toISOString(), refreshToken: `refresh-${n}`, user: me };
}

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) } as Response;
}

type Call = { url: string; init: RequestInit };

function setup(handler: (call: Call, calls: Call[]) => Promise<Response> | Response, initial: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn: FetchFn = jest.fn(async (url: string, init?: RequestInit) => {
    const call = { url, init: init ?? {} };
    calls.push(call);
    return handler(call, calls);
  });
  const storage = createMemoryStore(initial);
  const onSessionExpired = jest.fn();
  const session = new AuthSession({ baseUrl: () => 'http://api.test', storage, fetchFn, now: () => NOW, onSessionExpired });
  return { session, storage, calls, onSessionExpired };
}

const headers = (c: Call) => c.init.headers as Record<string, string>;
const body = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, string>;

describe('AuthSession', () => {
  it('logs in as mobile client and stores the refresh token securely', async () => {
    const { session, storage, calls } = setup(() => json(200, auth(1)));
    const user = await session.login(' team@rheinblick.example ', 'pw');
    expect(user.email).toBe('team@rheinblick.example');
    expect(calls[0]!.url).toBe('http://api.test/api/v1/auth/login');
    expect(headers(calls[0]!)['X-Client-Type']).toBe('mobile');
    expect(body(calls[0]!)).toEqual({ email: 'team@rheinblick.example', password: 'pw' });
    expect(storage.data[REFRESH_TOKEN_KEY]).toBe('refresh-1');
  });

  it('runs concurrent refreshes single-flight and stores the rotated token', async () => {
    let refreshes = 0;
    const { session, storage, calls } = setup(async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, auth(2));
      }
      return json(200, { ok: headers(call).Authorization });
    }, { [REFRESH_TOKEN_KEY]: 'refresh-1' });

    const results = await Promise.all([
      session.request<{ ok: string }>('/api/v1/admin/orders'),
      session.request<{ ok: string }>('/api/v1/admin/dashboard'),
      session.request<{ ok: string }>('/api/v1/admin/locations'),
    ]);

    expect(refreshes).toBe(1);
    const refreshCall = calls.find((c) => c.url.endsWith('/auth/refresh'))!;
    expect(body(refreshCall)).toEqual({ refreshToken: 'refresh-1' });
    expect(headers(refreshCall)['X-Client-Type']).toBe('mobile');
    expect(storage.data[REFRESH_TOKEN_KEY]).toBe('refresh-2');
    expect(results.map((r) => r.ok)).toEqual(['Bearer access-2', 'Bearer access-2', 'Bearer access-2']);
  });

  it('refreshes once and retries after a 401', async () => {
    let first = true;
    const { session, calls } = setup((call) => {
      if (call.url.endsWith('/auth/login')) return json(200, auth(1));
      if (call.url.endsWith('/auth/refresh')) return json(200, auth(2));
      if (first) {
        first = false;
        return json(401, { status: 401, title: 'Anmeldung erforderlich.', code: 'unauthorized' });
      }
      return json(200, { auth: headers(call).Authorization });
    });
    await session.login('a@b.de', 'pw');
    const result = await session.request<{ auth: string }>('/api/v1/admin/orders');
    expect(result.auth).toBe('Bearer access-2');
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('clears the session when the refresh token is rejected', async () => {
    const { session, storage, onSessionExpired } = setup(
      () => json(401, { status: 401, title: 'Sitzung abgelaufen. Bitte melde dich erneut an.', code: 'invalid_refresh_token' }),
      { [REFRESH_TOKEN_KEY]: 'reused' },
    );
    await expect(session.restore()).resolves.toBeNull();
    expect(storage.data[REFRESH_TOKEN_KEY]).toBeUndefined();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    await expect(session.request('/api/v1/admin/orders')).rejects.toMatchObject({ status: 401 });
  });

  it('keeps the refresh token on network errors', async () => {
    const { session, storage } = setup(() => {
      throw new TypeError('Network request failed');
    }, { [REFRESH_TOKEN_KEY]: 'refresh-1' });
    await expect(session.restore()).rejects.toBeInstanceOf(ApiError);
    await expect(session.restore()).rejects.toMatchObject({ code: 'network_error' });
    expect(storage.data[REFRESH_TOKEN_KEY]).toBe('refresh-1');
  });

  it('does not call the server on restore without a stored token', async () => {
    const { session, calls } = setup(() => json(200, auth(1)));
    await expect(session.restore()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('logs out locally and revokes the refresh token on the server', async () => {
    const { session, storage, calls } = setup((call) => (call.url.endsWith('/logout') ? json(204, undefined) : json(200, auth(1))));
    await session.login('a@b.de', 'pw');
    await session.logout();
    expect(storage.data[REFRESH_TOKEN_KEY]).toBeUndefined();
    const logout = calls.find((c) => c.url.endsWith('/auth/logout'))!;
    expect(body(logout)).toEqual({ refreshToken: 'refresh-1' });
    expect(session.hasAccessToken).toBe(false);
  });
});
