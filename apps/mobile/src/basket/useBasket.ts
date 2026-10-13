import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { PublicProductDto } from '@/api/types';
import * as B from './basket';
import { loadBasket, saveBasket } from './basketStorage';

/** Tiny external store: one basket per bakery slug, loaded lazily from AsyncStorage and persisted on change. */
type Entry = { basket: B.Basket; loaded: boolean; changes: B.BasketChange[]; listeners: Set<() => void> };
const NO_CHANGES: B.BasketChange[] = [];
const entries = new Map<string, Entry>();

function entry(slug: string): Entry {
  let e = entries.get(slug);
  if (!e) {
    e = { basket: B.emptyBasket(slug), loaded: false, changes: NO_CHANGES, listeners: new Set() };
    entries.set(slug, e);
    const created = e;
    void loadBasket(slug).then((stored) => {
      // Do not overwrite changes the user made while loading.
      if (created.basket.lines.length === 0 && !created.loaded) created.basket = stored;
      created.loaded = true;
      created.listeners.forEach((l) => l());
    });
  }
  return e;
}

export function updateBasket(slug: string, update: (b: B.Basket) => B.Basket): B.Basket {
  const e = entry(slug);
  const next = update(e.basket);
  if (next !== e.basket) {
    e.basket = next;
    e.loaded = true;
    void saveBasket(next);
    e.listeners.forEach((l) => l());
  }
  return next;
}

function setChanges(slug: string, changes: B.BasketChange[]) {
  const e = entry(slug);
  if (e.changes === changes) return;
  e.changes = changes;
  e.listeners.forEach((l) => l());
}

export function getBasket(slug: string): B.Basket {
  return entry(slug).basket;
}

/** For tests. */
export function resetBasketStore() {
  entries.clear();
}

export function useBasket(slug: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const e = entry(slug);
      e.listeners.add(listener);
      return () => {
        e.listeners.delete(listener);
      };
    },
    [slug],
  );
  const basket = useSyncExternalStore(subscribe, () => entry(slug).basket, () => entry(slug).basket);
  const loaded = useSyncExternalStore(subscribe, () => entry(slug).loaded, () => entry(slug).loaded);
  /** Adjustments made by the last re-validation (shown as a notice until dismissed). */
  const changes = useSyncExternalStore(subscribe, () => entry(slug).changes, () => entry(slug).changes);

  useEffect(() => {
    entry(slug);
  }, [slug]);

  return {
    basket,
    loaded,
    changes,
    dismissChanges: () => setChanges(slug, NO_CHANGES),
    count: B.basketCount(basket),
    totalCents: B.basketTotalCents(basket),
    quantityOf: (productId: string) => B.quantityOf(basket, productId),
    setQuantity: (product: PublicProductDto, quantity: number) => updateBasket(slug, (b) => B.setQuantity(b, product, quantity)),
    setContext: (locationId: string, date: string) => updateBasket(slug, (b) => B.withContext(b, locationId, date)),
    reconcile: (products: readonly PublicProductDto[]) => {
      let changes: B.BasketChange[] = [];
      updateBasket(slug, (b) => {
        const r = B.reconcileBasket(b, products);
        changes = r.changes;
        return r.basket;
      });
      if (changes.length) setChanges(slug, changes);
      return changes;
    },
    capLine: (productId: string, remaining: number) => updateBasket(slug, (b) => B.capLine(b, productId, remaining)),
    removeLines: (productIds: readonly string[]) =>
      updateBasket(slug, (b) => productIds.reduce((acc, id) => B.removeLine(acc, id), b)),
    clear: () => updateBasket(slug, (b) => ({ ...B.emptyBasket(slug), locationId: b.locationId, date: b.date })),
  };
}
