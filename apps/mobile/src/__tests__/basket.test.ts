import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PublicProductDto } from '@/api/types';
import {
  basketCount,
  basketTotalCents,
  capLine,
  emptyBasket,
  reconcileBasket,
  setQuantity,
  toOrderItems,
  withContext,
} from '@/basket/basket';
import { basketKey, loadBasket, saveBasket } from '@/basket/basketStorage';

function product(overrides: Partial<PublicProductDto> = {}): PublicProductDto {
  return {
    id: 'p1',
    name: 'Classic Donut',
    slug: 'classic-donut',
    description: null,
    categoryId: null,
    price: 1.9,
    currency: 'EUR',
    imageUrl: '/media/demo/classic-donut.svg',
    allergens: null,
    ingredients: null,
    dietaryLabels: [],
    leadTimeHours: 0,
    remaining: 10,
    availability: 'Available',
    ...overrides,
  };
}

describe('basket math (integer cents)', () => {
  it('sums quantities and totals exactly', () => {
    let b = emptyBasket('baeckerei-rheinblick');
    b = setQuantity(b, product(), 3); // 3 × 1,90
    b = setQuantity(b, product({ id: 'p2', name: 'Schoko-Donut', price: 2.2 }), 2); // 2 × 2,20
    b = setQuantity(b, product({ id: 'p3', name: 'Cent', price: 0.1 }), 3); // 3 × 0,10 (float trap)
    expect(basketCount(b)).toBe(8);
    expect(basketTotalCents(b)).toBe(570 + 440 + 30);
    expect(toOrderItems(b)).toEqual([
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 2 },
      { productId: 'p3', quantity: 3 },
    ]);
  });

  it('clamps quantities to remaining stock and removes lines at 0', () => {
    let b = setQuantity(emptyBasket('x'), product({ remaining: 4 }), 9);
    expect(b.lines[0]!.quantity).toBe(4);
    b = setQuantity(b, product({ remaining: 4 }), 0);
    expect(b.lines).toHaveLength(0);
    expect(setQuantity(emptyBasket('x'), product({ availability: 'SoldOut', remaining: 0 }), 1).lines).toHaveLength(0);
  });

  it('caps a line after an insufficient_stock error', () => {
    let b = setQuantity(emptyBasket('x'), product(), 5);
    b = capLine(b, 'p1', 2);
    expect(b.lines[0]!.quantity).toBe(2);
    expect(capLine(b, 'p1', 0).lines).toHaveLength(0);
  });

  it('keeps identity when the context does not change', () => {
    const b = withContext(emptyBasket('x'), 'loc', '2026-10-14');
    expect(withContext(b, 'loc', '2026-10-14')).toBe(b);
    expect(withContext(b, 'loc', '2026-10-15').date).toBe('2026-10-15');
  });

  it('re-validates against fresh product data', () => {
    let b = emptyBasket('x');
    b = setQuantity(b, product({ id: 'a', name: 'A', remaining: 10 }), 5);
    b = setQuantity(b, product({ id: 'b', name: 'B' }), 1);
    b = setQuantity(b, product({ id: 'c', name: 'C', price: 2 }), 1);
    const fresh = [
      product({ id: 'a', name: 'A', remaining: 3, availability: 'Low' }),
      product({ id: 'c', name: 'C', price: 2.5 }),
    ];
    const { basket, changes } = reconcileBasket(b, fresh);
    expect(basket.lines.map((l) => [l.productId, l.quantity, l.unitPriceCents])).toEqual([
      ['a', 3, 190],
      ['c', 1, 250],
    ]);
    expect(changes).toEqual(
      expect.arrayContaining([
        { type: 'reduced', productId: 'a', name: 'A', quantity: 3 },
        { type: 'removed', productId: 'b', name: 'B' },
        { type: 'price', productId: 'c', name: 'C', fromCents: 200, toCents: 250 },
      ]),
    );
  });

  it('returns the same basket when nothing changed', () => {
    const b = setQuantity(emptyBasket('x'), product(), 2);
    const r = reconcileBasket(b, [product()]);
    expect(r.changes).toHaveLength(0);
    expect(r.basket).toBe(b);
  });
});

describe('basket persistence (AsyncStorage, keyed by slug)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a basket', async () => {
    const b = withContext(setQuantity(emptyBasket('rheinblick'), product(), 2), 'loc', '2026-10-14');
    await saveBasket(b);
    expect(await AsyncStorage.getItem(basketKey('rheinblick'))).not.toBeNull();
    const loaded = await loadBasket('rheinblick');
    expect(loaded.lines).toEqual(b.lines);
    expect(loaded.date).toBe('2026-10-14');
    expect((await loadBasket('other')).lines).toHaveLength(0);
  });

  it('removes the key for an empty basket', async () => {
    await saveBasket(setQuantity(emptyBasket('s'), product(), 1));
    await saveBasket(emptyBasket('s'));
    expect(await AsyncStorage.getItem(basketKey('s'))).toBeNull();
  });

  it('ignores corrupt, foreign or stale data', async () => {
    await AsyncStorage.setItem(basketKey('s'), '{not json');
    expect((await loadBasket('s')).lines).toHaveLength(0);
    await AsyncStorage.setItem(basketKey('s'), JSON.stringify({ ...emptyBasket('other'), lines: [] }));
    expect((await loadBasket('s')).slug).toBe('s');
    const old = { ...setQuantity(emptyBasket('s'), product(), 1), updatedAt: Date.now() - 8 * 24 * 3600_000 };
    await AsyncStorage.setItem(basketKey('s'), JSON.stringify(old));
    expect((await loadBasket('s')).lines).toHaveLength(0);
  });
});
