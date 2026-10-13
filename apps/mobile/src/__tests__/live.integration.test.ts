/**
 * @jest-environment node
 */
/**
 * End-to-end check of the mobile API client against a running BackReserve API (Development demo data).
 * Skipped unless LIVE_API_URL is set:  npm run test:live   (defaults to http://localhost:5280)
 *
 * Creates real reservations in the dev database (one cancelled by the "customer", one collected by staff).
 */
import { createAdminApi } from '@/api/adminApi';
import { AuthSession } from '@/api/authSession';
import { isApiError } from '@/api/errors';
import { createPublicApi } from '@/api/publicApi';
import type { CreateOrderRequest } from '@/api/types';
import type { KeyValueStore } from '@/storage/secureStorage';

const BASE = process.env.LIVE_API_URL?.replace(/\/+$/, '');
const describeLive = BASE ? describe : describe.skip;
const PASSWORD = 'BackReserve-Demo-2026';
function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}
interface NodeResponse {
  statusCode: number;
  setEncoding(enc: string): void;
  on(event: string, cb: (chunk: string) => void): void;
}

/** Minimal fetch over node:http/https (only what httpRequest needs: method, headers, body, status, text). */
function nodeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = input.startsWith('https:') ? require('node:https') : require('node:http');
  return new Promise((resolve, reject) => {
    const req = lib.request(input, { method: init.method ?? 'GET', headers: init.headers as Record<string, string> }, (res: NodeResponse) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => text } as Response);
      });
    });
    req.on('error', reject);
    if (init.body) req.write(String(init.body));
    req.end();
  });
}
const uuid = () => `mobile-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

describeLive('live API (mobile client code)', () => {
  jest.setTimeout(60_000);
  // jest-expo replaces global fetch with a mock, so the live test uses a minimal adapter over node:http.
  const fetchFn = nodeFetch;
  const api = createPublicApi(() => BASE!, fetchFn);

  async function buildOrder(quantity = 1): Promise<CreateOrderRequest> {
    const bakery = await api.getBakery('baeckerei-rheinblick');
    const location = bakery.locations.find((l) => l.acceptsOrders)!;
    const dates = await api.getAvailability(bakery.slug, location.id);
    const date = dates.find((d) => d.isOrderable)!.date;
    const products = await api.getProducts(bakery.slug, location.id, date);
    const product = products.products.find((p) => p.availability !== 'SoldOut' && p.remaining >= quantity)!;
    const slots = await api.getPickupSlots(location.id, date, [product.id]);
    const slot = slots.slots.find((s) => s.available)!;
    return {
      locationId: location.id,
      pickupDate: date,
      slotStart: slot.start,
      items: [{ productId: product.id, quantity }],
      customer: { firstName: 'Mobil', lastName: 'Test', email: 'mobile-live@example.com', phone: null },
      note: 'Live-Test der Mobile-App',
      acceptTerms: true,
    };
  }

  it('loads the public catalog', async () => {
    const bakery = await api.getBakery('baeckerei-rheinblick');
    expect(bakery.name).toBe('Bäckerei Rheinblick');
    expect(bakery.locations.length).toBeGreaterThan(0);
    const dates = await api.getAvailability(bakery.slug, bakery.locations[0]!.id);
    expect(dates.some((d) => d.isOrderable)).toBe(true);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });

  it('creates a reservation idempotently, reads it with the token and cancels it', async () => {
    const request = await buildOrder(1);
    const key = uuid();
    const created = await api.createOrder(request, key);
    expect(created.order.publicReference).toMatch(/^BR-[2-9A-HJKMNP-Z]{6}$/);
    expect(created.order.status).toBe('Confirmed');
    expect(created.accessToken.length).toBeGreaterThan(20);

    const replay = await api.createOrder(request, key);
    expect(replay.order.publicReference).toBe(created.order.publicReference);

    const fetched = await api.getOrder(created.order.publicReference, created.accessToken);
    expect(fetched.items[0]!.quantity).toBe(1);
    expect(fetched.canCancel).toBe(true);

    await expect(api.getOrder(created.order.publicReference, 'wrong-token-wrong-token-wrong')).rejects.toMatchObject({ status: 404 });

    const cancelled = await api.cancelOrder(created.order.publicReference, created.accessToken);
    expect(cancelled.status).toBe('Cancelled');
  });

  it('rejects invalid input with German validation messages', async () => {
    const request = await buildOrder(1);
    try {
      await api.createOrder({ ...request, customer: { ...request.customer, email: 'kein-email' }, acceptTerms: false }, uuid());
      throw new Error('expected failure');
    } catch (e) {
      expect(isApiError(e)).toBe(true);
      if (!isApiError(e)) return;
      expect(e.code).toBe('validation_failed');
      expect(e.title).toBe('Bitte überprüfe deine Eingaben.');
    }
  });

  it('lets staff look up, process, annotate and collect an order', async () => {
    const created = await api.createOrder(await buildOrder(1), uuid());
    const ref = created.order.publicReference;

    const session = new AuthSession({ baseUrl: () => BASE!, storage: memoryStore(), fetchFn });
    const me = await session.login('team@rheinblick.example', PASSWORD);
    const tenantId = me.memberships[0]!.tenantId;
    const admin = createAdminApi(session, () => tenantId);

    // refresh single-flight against the real rotation + reuse detection
    const [a, b] = await Promise.all([session.refresh(), session.refresh()]);
    expect(a?.accessToken).toBe(b?.accessToken);

    const found = await admin.lookup(ref.replace('BR-', 'br ').toLowerCase());
    expect(found.publicReference).toBe(ref);
    expect(found.allowedActions).toEqual(expect.arrayContaining(['prepare', 'collect']));

    await admin.action(found.id, 'prepare');
    const noted = await admin.reportProblem(found.id, 'Ein Teil fehlte kurzzeitig');
    const note = noted.history.find((h) => h.fromStatus === h.toStatus);
    expect(note?.note).toContain('Ein Teil fehlte kurzzeitig');
    expect(noted.status).toBe('Preparing');

    await admin.action(found.id, 'ready');
    const collected = await admin.action(found.id, 'collect');
    expect(collected.status).toBe('Collected');

    await expect(admin.action(found.id, 'collect')).rejects.toMatchObject({ status: 409 });

    const list = await admin.listOrders({ dateFrom: created.order.pickupDate, dateTo: created.order.pickupDate, search: ref, pageSize: 10 });
    expect(list.items.map((o) => o.publicReference)).toContain(ref);

    await session.logout();
  });
});
