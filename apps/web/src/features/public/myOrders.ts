import { safeStorage } from '@/lib/storage';

/** Orders placed/opened on this device ("Meine Bestellungen"). The token is a capability for that order only. */
export interface StoredOrder {
  reference: string;
  token: string;
  bakeryName: string;
  bakerySlug: string;
  pickupDate: string;
  slotStart: string;
  slotEnd: string;
  total: number;
  savedAt: number;
}

const KEY = 'br.myOrders';
const MAX = 30;

export function listMyOrders(): StoredOrder[] {
  const list = safeStorage.getJson<StoredOrder[]>(KEY);
  return Array.isArray(list) ? list.filter((o) => o && typeof o.reference === 'string' && typeof o.token === 'string') : [];
}

export function saveMyOrder(order: StoredOrder) {
  const rest = listMyOrders().filter((o) => o.reference !== order.reference);
  safeStorage.setJson(KEY, [order, ...rest].slice(0, MAX));
}

export function findMyOrder(reference: string): StoredOrder | undefined {
  return listMyOrders().find((o) => o.reference.toUpperCase() === reference.toUpperCase());
}

export function removeMyOrder(reference: string) {
  safeStorage.setJson(
    KEY,
    listMyOrders().filter((o) => o.reference !== reference),
  );
}
