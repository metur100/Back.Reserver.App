import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyBasket, type Basket } from './basket';

/** Baskets are persisted per bakery slug in AsyncStorage (no personal data, only product ids/quantities). */
export const basketKey = (slug: string) => `br.basket.${slug}`;

/** Baskets older than this are discarded on load (pickup dates would be stale anyway). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AsyncKeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function isBasket(value: unknown, slug: string): value is Basket {
  if (!value || typeof value !== 'object') return false;
  const b = value as Basket;
  return (
    b.slug === slug &&
    Array.isArray(b.lines) &&
    b.lines.every(
      (l) => typeof l.productId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0 && Number.isInteger(l.unitPriceCents),
    )
  );
}

export async function loadBasket(slug: string, storage: AsyncKeyValue = AsyncStorage, now = Date.now()): Promise<Basket> {
  try {
    const raw = await storage.getItem(basketKey(slug));
    if (!raw) return emptyBasket(slug);
    const parsed: unknown = JSON.parse(raw);
    if (!isBasket(parsed, slug)) return emptyBasket(slug);
    if (now - (parsed.updatedAt ?? 0) > MAX_AGE_MS) return emptyBasket(slug);
    return parsed;
  } catch {
    return emptyBasket(slug);
  }
}

export async function saveBasket(basket: Basket, storage: AsyncKeyValue = AsyncStorage): Promise<void> {
  try {
    if (basket.lines.length === 0) await storage.removeItem(basketKey(basket.slug));
    else await storage.setItem(basketKey(basket.slug), JSON.stringify(basket));
  } catch {
    // Persistence is best-effort.
  }
}
