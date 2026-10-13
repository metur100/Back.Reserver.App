import { secureStorage, type KeyValueStore } from '@/storage/secureStorage';

/**
 * "Meine Bestellungen": orders placed or opened on this device, with their capability token, kept in SecureStore.
 * Each order is stored under its own key (SecureStore values should stay small) plus an index of references.
 */
export interface SavedOrder {
  reference: string;
  token: string;
  bakeryName: string;
  bakerySlug: string;
  pickupDate: string;
  slotStart: string;
  slotEnd: string;
  savedAt: number;
  reminderId?: string | null;
}

const INDEX_KEY = 'br.orders.index';
const orderKey = (reference: string) => `br.order.${reference.replace(/[^A-Za-z0-9_-]/g, '')}`;
const MAX_ORDERS = 50;

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeSavedOrders(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => listeners.forEach((l) => l());

async function readIndex(store: KeyValueStore): Promise<string[]> {
  try {
    const raw = await store.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function listSavedOrders(store: KeyValueStore = secureStorage): Promise<SavedOrder[]> {
  const refs = await readIndex(store);
  const orders = await Promise.all(
    refs.map(async (ref) => {
      try {
        const raw = await store.getItem(orderKey(ref));
        return raw ? (JSON.parse(raw) as SavedOrder) : null;
      } catch {
        return null;
      }
    }),
  );
  return orders
    .filter((o): o is SavedOrder => !!o && typeof o.token === 'string')
    .sort((a, b) => (a.pickupDate + a.slotStart).localeCompare(b.pickupDate + b.slotStart));
}

export async function getSavedOrder(reference: string, store: KeyValueStore = secureStorage): Promise<SavedOrder | null> {
  try {
    const raw = await store.getItem(orderKey(reference));
    return raw ? (JSON.parse(raw) as SavedOrder) : null;
  } catch {
    return null;
  }
}

export async function saveOrder(order: SavedOrder, store: KeyValueStore = secureStorage): Promise<void> {
  const existing = await getSavedOrder(order.reference, store);
  const merged: SavedOrder = { ...existing, ...order, reminderId: order.reminderId ?? existing?.reminderId ?? null };
  await store.setItem(orderKey(order.reference), JSON.stringify(merged));
  const refs = (await readIndex(store)).filter((r) => r !== order.reference);
  refs.unshift(order.reference);
  const kept = refs.slice(0, MAX_ORDERS);
  for (const dropped of refs.slice(MAX_ORDERS)) await store.removeItem(orderKey(dropped));
  await store.setItem(INDEX_KEY, JSON.stringify(kept));
  notify();
}

export async function updateSavedOrder(
  reference: string,
  patch: Partial<SavedOrder>,
  store: KeyValueStore = secureStorage,
): Promise<void> {
  const existing = await getSavedOrder(reference, store);
  if (!existing) return;
  await store.setItem(orderKey(reference), JSON.stringify({ ...existing, ...patch }));
  notify();
}

export async function removeSavedOrder(reference: string, store: KeyValueStore = secureStorage): Promise<void> {
  await store.removeItem(orderKey(reference));
  const refs = (await readIndex(store)).filter((r) => r !== reference);
  await store.setItem(INDEX_KEY, JSON.stringify(refs));
  notify();
}
