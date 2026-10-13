import { useCallback, useSyncExternalStore } from 'react';
import type { PublicProductDto } from '@/api/types';
import { toCents } from '@/lib/money';
import { safeStorage } from '@/lib/storage';

/** Server-side limit per order line (CreateOrderRequestValidator). */
export const MAX_QUANTITY_PER_ITEM = 200;
export const MAX_LINES = 50;

export interface BasketItem {
  productId: string;
  name: string;
  /** Display only — the server computes the authoritative total. */
  unitPriceCents: number;
  quantity: number;
  /** Remaining stock at the time it was last checked. */
  maxQuantity: number;
  imageUrl: string | null;
  leadTimeHours: number;
}

/** One basket = one bakery + one location + one pickup date. */
export interface Basket {
  slug: string;
  locationId: string;
  date: string;
  items: BasketItem[];
  updatedAt: number;
}

export type BasketChange =
  | { type: 'removed'; productId: string; name: string }
  | { type: 'reduced'; productId: string; name: string; from: number; to: number }
  | { type: 'price'; productId: string; name: string; fromCents: number; toCents: number };

type ProductLike = Pick<PublicProductDto, 'id' | 'name' | 'price' | 'remaining' | 'imageUrl' | 'leadTimeHours'>;

export function emptyBasket(slug: string, locationId: string, date: string): Basket {
  return { slug, locationId, date, items: [], updatedAt: Date.now() };
}

const limitFor = (remaining: number) => Math.max(0, Math.min(remaining, MAX_QUANTITY_PER_ITEM));

export function addItem(basket: Basket, product: ProductLike, quantity = 1): Basket {
  const max = limitFor(product.remaining);
  if (max <= 0 || quantity <= 0) return basket;
  const existing = basket.items.find((i) => i.productId === product.id);
  if (!existing && basket.items.length >= MAX_LINES) return basket;
  const items = existing
    ? basket.items.map((i) =>
        i.productId === product.id
          ? { ...i, quantity: Math.min(max, i.quantity + quantity), maxQuantity: max, unitPriceCents: toCents(product.price) }
          : i,
      )
    : [
        ...basket.items,
        {
          productId: product.id,
          name: product.name,
          unitPriceCents: toCents(product.price),
          quantity: Math.min(max, quantity),
          maxQuantity: max,
          imageUrl: product.imageUrl,
          leadTimeHours: product.leadTimeHours,
        },
      ];
  return { ...basket, items, updatedAt: Date.now() };
}

export function setQuantity(basket: Basket, productId: string, quantity: number): Basket {
  if (quantity <= 0) return removeItem(basket, productId);
  return {
    ...basket,
    items: basket.items.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(quantity, i.maxQuantity, MAX_QUANTITY_PER_ITEM) } : i)),
    updatedAt: Date.now(),
  };
}

export function removeItem(basket: Basket, productId: string): Basket {
  return { ...basket, items: basket.items.filter((i) => i.productId !== productId), updatedAt: Date.now() };
}

export function quantityOf(basket: Basket | null, productId: string): number {
  return basket?.items.find((i) => i.productId === productId)?.quantity ?? 0;
}

export function lineTotalCents(item: BasketItem): number {
  return item.unitPriceCents * item.quantity;
}

export function basketCount(basket: Basket | null): number {
  return basket ? basket.items.reduce((sum, i) => sum + i.quantity, 0) : 0;
}

export function basketTotalCents(basket: Basket | null): number {
  return basket ? basket.items.reduce((sum, i) => sum + lineTotalCents(i), 0) : 0;
}

/**
 * Compares the stored basket with freshly fetched products: removes products that are gone or sold out,
 * reduces quantities above remaining stock and adopts current prices. Returns the changes for user feedback.
 */
export function reconcileBasket(basket: Basket, products: readonly ProductLike[]): { basket: Basket; changes: BasketChange[] } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const changes: BasketChange[] = [];
  const items: BasketItem[] = [];
  for (const item of basket.items) {
    const product = byId.get(item.productId);
    const max = product ? limitFor(product.remaining) : 0;
    if (!product || max <= 0) {
      changes.push({ type: 'removed', productId: item.productId, name: item.name });
      continue;
    }
    let next: BasketItem = { ...item, name: product.name, maxQuantity: max, imageUrl: product.imageUrl, leadTimeHours: product.leadTimeHours };
    if (item.quantity > max) {
      changes.push({ type: 'reduced', productId: item.productId, name: product.name, from: item.quantity, to: max });
      next = { ...next, quantity: max };
    }
    const priceCents = toCents(product.price);
    if (priceCents !== item.unitPriceCents) {
      changes.push({ type: 'price', productId: item.productId, name: product.name, fromCents: item.unitPriceCents, toCents: priceCents });
      next = { ...next, unitPriceCents: priceCents };
    }
    items.push(next);
  }
  if (changes.length === 0) return { basket, changes };
  return { basket: { ...basket, items, updatedAt: Date.now() }, changes };
}

/** Applies a server-reported stock limit (409 insufficient_stock) to a single line. */
export function applyStockLimit(basket: Basket, productId: string, remaining: number): Basket {
  if (remaining <= 0) return removeItem(basket, productId);
  return {
    ...basket,
    items: basket.items.map((i) => (i.productId === productId ? { ...i, maxQuantity: remaining, quantity: Math.min(i.quantity, remaining) } : i)),
    updatedAt: Date.now(),
  };
}

// ---------- Persistence (localStorage keyed by bakery slug) ----------

const keyFor = (slug: string) => `br.basket.${slug}`;

function isBasket(value: unknown): value is Basket {
  if (!value || typeof value !== 'object') return false;
  const b = value as Basket;
  return typeof b.slug === 'string' && typeof b.locationId === 'string' && typeof b.date === 'string' && Array.isArray(b.items);
}

export function loadBasket(slug: string): Basket | null {
  const raw = safeStorage.getJson<unknown>(keyFor(slug));
  return isBasket(raw) && raw.slug === slug ? raw : null;
}

export function saveBasket(basket: Basket | null, slug: string) {
  if (!basket || basket.items.length === 0) safeStorage.remove(keyFor(slug));
  else safeStorage.setJson(keyFor(slug), basket);
}

// ---------- Reactive store ----------

const cache = new Map<string, Basket | null>();
const listeners = new Map<string, Set<() => void>>();

function read(slug: string): Basket | null {
  if (!cache.has(slug)) cache.set(slug, loadBasket(slug));
  return cache.get(slug) ?? null;
}

export function writeBasket(slug: string, next: Basket | null) {
  cache.set(slug, next && next.items.length > 0 ? next : null);
  saveBasket(next, slug);
  listeners.get(slug)?.forEach((l) => l());
}

/** Test helper: forget cached baskets. */
export function resetBasketStore() {
  cache.clear();
}

export function useBasket(slug: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(slug);
      if (!set) listeners.set(slug, (set = new Set()));
      set.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === keyFor(slug)) {
          cache.delete(slug);
          listener();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        set.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    [slug],
  );
  const basket = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => null,
  );
  const update = useCallback((fn: (current: Basket | null) => Basket | null) => writeBasket(slug, fn(read(slug))), [slug]);
  return { basket, update };
}
