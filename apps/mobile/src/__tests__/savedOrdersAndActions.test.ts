import type { Permission } from '@/api/types';
import { getSavedOrder, listSavedOrders, removeSavedOrder, saveOrder, updateSavedOrder, type SavedOrder } from '@/orders/savedOrders';
import { canReportProblem, primaryActionFor } from '@/staff/actions';
import { createMemoryStore } from '@/storage/secureStorage';

const order = (ref: string, date: string, slot = '09:00'): SavedOrder => ({
  reference: ref,
  token: `token-${ref}`,
  bakeryName: 'Bäckerei Rheinblick',
  bakerySlug: 'baeckerei-rheinblick',
  pickupDate: date,
  slotStart: slot,
  slotEnd: '09:15',
  savedAt: 1,
});

describe('saved orders (SecureStore)', () => {
  it('stores each order under its own key and lists them by pickup time', async () => {
    const store = createMemoryStore();
    await saveOrder(order('BR-BBBBBB', '2026-10-15'), store);
    await saveOrder(order('BR-AAAAAA', '2026-10-14'), store);
    expect(Object.keys(store.data).sort()).toEqual(['br.order.BR-AAAAAA', 'br.order.BR-BBBBBB', 'br.orders.index']);
    expect((await listSavedOrders(store)).map((o) => o.reference)).toEqual(['BR-AAAAAA', 'BR-BBBBBB']);
  });

  it('keeps the reminder id when an order is saved again and supports updates/removal', async () => {
    const store = createMemoryStore();
    await saveOrder(order('BR-AAAAAA', '2026-10-14'), store);
    await updateSavedOrder('BR-AAAAAA', { reminderId: 'n1' }, store);
    await saveOrder({ ...order('BR-AAAAAA', '2026-10-14'), token: 'new' }, store);
    expect(await getSavedOrder('BR-AAAAAA', store)).toMatchObject({ token: 'new', reminderId: 'n1' });
    await removeSavedOrder('BR-AAAAAA', store);
    expect(await getSavedOrder('BR-AAAAAA', store)).toBeNull();
    expect(await listSavedOrders(store)).toEqual([]);
  });
});

describe('staff primary actions', () => {
  const can = (...perms: Permission[]) => (p: Permission) => perms.includes(p);

  it('follows Vorbereiten → Bereit → Abgeholt for full permissions', () => {
    const all = can('OrdersProcess', 'PickupCollect');
    expect(primaryActionFor('Confirmed', all)).toBe('prepare');
    expect(primaryActionFor('Preparing', all)).toBe('ready');
    expect(primaryActionFor('ReadyForPickup', all)).toBe('collect');
    expect(primaryActionFor('Collected', all)).toBeNull();
    expect(primaryActionFor('Cancelled', all)).toBeNull();
  });

  it('respects permissions', () => {
    expect(primaryActionFor('Confirmed', can('PickupCollect'))).toBe('collect');
    expect(primaryActionFor('ReadyForPickup', can('OrdersProcess'))).toBeNull();
    expect(primaryActionFor('Confirmed', can('OrdersView'))).toBeNull();
    expect(canReportProblem(can('OrdersView'))).toBe(false);
    expect(canReportProblem(can('PickupCollect'))).toBe(true);
  });
});
