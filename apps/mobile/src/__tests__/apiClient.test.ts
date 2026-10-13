import { createAdminApi } from '@/api/adminApi';
import type { AuthSession } from '@/api/authSession';
import { problemToError } from '@/api/errors';
import { buildQuery, httpRequest } from '@/api/http';
import { createPublicApi } from '@/api/publicApi';
import { resolveApiUrl, resolveMediaUrl } from '@/config/env';
import { parseBakeryInput, rewriteFragmentToken } from '@/utils/links';

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe('http helpers', () => {
  it('repeats array query keys as ASP.NET expects', () => {
    expect(buildQuery({ date: '2026-10-14', productIds: ['a', 'b'], empty: '', skip: undefined })).toBe('?date=2026-10-14&productIds=a&productIds=b');
  });

  it('turns problem+json into ApiError with German title and code', async () => {
    const fetchFn = jest.fn(async () =>
      json(409, { status: 409, title: 'Von „Classic Donut“ sind nur noch 2 Stück verfügbar.', code: 'insufficient_stock', productId: 'p1', remaining: 2 }),
    );
    await expect(httpRequest('http://x', '/api', {}, fetchFn)).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_stock',
      title: 'Von „Classic Donut“ sind nur noch 2 Stück verfügbar.',
      problem: expect.objectContaining({ productId: 'p1', remaining: 2 }),
    });
  });

  it('falls back to German messages for non-German / empty problems', () => {
    expect(problemToError(400, { title: 'One or more validation errors occurred.' }).title).toBe('Bitte überprüfe deine Eingaben.');
    expect(problemToError(429, null)).toMatchObject({ code: 'rate_limited', title: expect.stringContaining('Zu viele Anfragen') });
    expect(problemToError(500, undefined).code).toBe('internal_error');
  });

  it('maps connectivity failures to a German network error', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(httpRequest('http://x', '/api', {}, fetchFn)).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});

describe('public API', () => {
  it('sends the idempotency key and never prices', async () => {
    const fetchFn = jest.fn(async (_url: string, _init?: RequestInit) => json(201, { order: {}, accessToken: 't' }));
    const api = createPublicApi(() => 'http://api', fetchFn);
    await api.createOrder(
      {
        locationId: 'loc',
        pickupDate: '2026-10-14',
        slotStart: '09:00',
        items: [{ productId: 'p1', quantity: 2 }],
        customer: { firstName: 'Anna', lastName: null, email: 'a@b.de', phone: null },
        note: null,
        acceptTerms: true,
      },
      'key-123456',
    );
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/v1/public/orders');
    expect((init!.headers as Record<string, string>)['Idempotency-Key']).toBe('key-123456');
    expect(String(init!.body)).not.toMatch(/price/i);
  });

  it('passes the order capability token as X-Order-Token', async () => {
    const fetchFn = jest.fn(async (_url: string, _init?: RequestInit) => json(200, {}));
    const api = createPublicApi(() => 'http://api', fetchFn);
    await api.getOrder('BR-7K4M9X', 'secret-token');
    expect(fetchFn.mock.calls[0]![0]).toBe('http://api/api/v1/public/orders/BR-7K4M9X');
    expect((fetchFn.mock.calls[0]![1]!.headers as Record<string, string>)['X-Order-Token']).toBe('secret-token');
  });
});

describe('admin API', () => {
  it('adds the tenant header and posts problem reports', async () => {
    const request = jest.fn(async () => ({}));
    const api = createAdminApi({ request } as unknown as AuthSession, () => 'tenant-1');
    await api.reportProblem('o1', 'Croissant fehlt');
    expect(request).toHaveBeenCalledWith('/api/v1/admin/orders/o1/problem', {
      method: 'POST',
      headers: { 'X-Tenant-Id': 'tenant-1' },
      body: { note: 'Croissant fehlt' },
    });
    await api.listOrders({ dateFrom: '2026-10-13', dateTo: '2026-10-13', status: ['Confirmed', 'Preparing'], search: '  ' });
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/admin/orders',
      expect.objectContaining({ query: expect.objectContaining({ status: ['Confirmed', 'Preparing'], search: undefined }) }),
    );
  });
});

describe('configuration and links', () => {
  it('resolves API URLs with platform defaults', () => {
    expect(resolveApiUrl({ os: 'android' })).toBe('http://10.0.2.2:5280');
    expect(resolveApiUrl({ os: 'ios' })).toBe('http://localhost:5280');
    expect(resolveApiUrl({ envUrl: 'http://192.168.0.10:5280/', os: 'android' })).toBe('http://192.168.0.10:5280');
    expect(resolveApiUrl({ extraUrl: 'https://api.backreserve.example', os: 'ios' })).toBe('https://api.backreserve.example');
  });

  it('prefixes relative media URLs', () => {
    expect(resolveMediaUrl('/media/demo/classic-donut.svg', 'http://localhost:5280')).toBe('http://localhost:5280/media/demo/classic-donut.svg');
    expect(resolveMediaUrl('https://cdn.example/x.png', 'http://localhost:5280')).toBe('https://cdn.example/x.png');
    expect(resolveMediaUrl(null)).toBeNull();
  });

  it('parses bakery slugs and links', () => {
    expect(parseBakeryInput('baeckerei-rheinblick')).toBe('baeckerei-rheinblick');
    expect(parseBakeryInput(' Baeckerei-Rheinblick ')).toBe('baeckerei-rheinblick');
    expect(parseBakeryInput('https://app.backreserve.example/b/baeckerei-rheinblick')).toBe('baeckerei-rheinblick');
    expect(parseBakeryInput('app.backreserve.example/b/donut-atelier?utm=1')).toBe('donut-atelier');
    expect(parseBakeryInput('backreserve://b/donut-atelier')).toBe('donut-atelier');
    expect(parseBakeryInput('not a slug!')).toBeNull();
    expect(parseBakeryInput('')).toBeNull();
  });

  it('moves the e-mail link fragment token into the query', () => {
    expect(rewriteFragmentToken('/bestellung/BR-7K4M9X#t=abc_DEF-1')).toBe('/bestellung/BR-7K4M9X?t=abc_DEF-1');
    expect(rewriteFragmentToken('https://app.backreserve.example/bestellung/BR-7K4M9X#t=abc')).toBe(
      'https://app.backreserve.example/bestellung/BR-7K4M9X?t=abc',
    );
    expect(rewriteFragmentToken('/b/x')).toBe('/b/x');
  });
});
