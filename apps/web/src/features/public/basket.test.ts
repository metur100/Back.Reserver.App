import { describe, expect, it } from 'vitest';
import { product } from '@/test/utils';
import {
  addItem,
  applyStockLimit,
  basketCount,
  basketTotalCents,
  emptyBasket,
  loadBasket,
  MAX_QUANTITY_PER_ITEM,
  reconcileBasket,
  removeItem,
  resetBasketStore,
  setQuantity,
  writeBasket,
} from './basket';

const base = () => emptyBasket('baeckerei', 'loc-1', '2026-10-14');

describe('basket calculations', () => {
  it('computes totals in integer cents without floating point drift', () => {
    let b = addItem(base(), product({ id: 'a', price: 0.1, remaining: 50 }), 1);
    b = addItem(b, product({ id: 'b', price: 0.2, remaining: 50 }), 1);
    expect(basketTotalCents(b)).toBe(30); // 0.1 + 0.2 would be 0.30000000000000004 as float

    let c = addItem(base(), product({ id: 'd', price: 1.9, remaining: 50 }), 3);
    c = addItem(c, product({ id: 'e', price: 2.2, remaining: 50 }), 1);
    expect(basketTotalCents(c)).toBe(790);
    expect(basketCount(c)).toBe(4);
  });

  it('adds, merges and removes items', () => {
    let b = addItem(base(), product({ id: 'a' }), 1);
    b = addItem(b, product({ id: 'a' }), 2);
    expect(b.items).toHaveLength(1);
    expect(b.items[0]!.quantity).toBe(3);
    b = setQuantity(b, 'a', 0);
    expect(b.items).toHaveLength(0);
    b = addItem(b, product({ id: 'x' }), 1);
    expect(removeItem(b, 'x').items).toHaveLength(0);
  });

  it('never exceeds remaining stock or the per-line maximum', () => {
    let b = addItem(base(), product({ id: 'a', remaining: 3 }), 5);
    expect(b.items[0]!.quantity).toBe(3);
    b = setQuantity(b, 'a', 10);
    expect(b.items[0]!.quantity).toBe(3);
    const big = addItem(base(), product({ id: 'big', remaining: 1000 }), 999);
    expect(big.items[0]!.quantity).toBe(MAX_QUANTITY_PER_ITEM);
  });

  it('does not add sold-out products', () => {
    const b = addItem(base(), product({ id: 'a', remaining: 0, availability: 'SoldOut' }), 1);
    expect(b.items).toHaveLength(0);
  });

  it('applies a server stock limit (409 insufficient_stock)', () => {
    let b = addItem(base(), product({ id: 'a', remaining: 10 }), 6);
    b = applyStockLimit(b, 'a', 2);
    expect(b.items[0]).toMatchObject({ quantity: 2, maxQuantity: 2 });
    expect(applyStockLimit(b, 'a', 0).items).toHaveLength(0);
  });
});

describe('basket persistence', () => {
  it('stores the basket per bakery slug and restores it', () => {
    const b = addItem(base(), product({ id: 'a' }), 2);
    writeBasket('baeckerei', b);
    resetBasketStore();
    expect(loadBasket('baeckerei')?.items[0]?.quantity).toBe(2);
    expect(loadBasket('andere-baeckerei')).toBeNull();
  });

  it('removes the stored basket when it becomes empty and ignores corrupt data', () => {
    writeBasket('baeckerei', addItem(base(), product({ id: 'a' }), 1));
    writeBasket('baeckerei', null);
    expect(window.localStorage.getItem('br.basket.baeckerei')).toBeNull();
    window.localStorage.setItem('br.basket.baeckerei', '{kaputt');
    expect(loadBasket('baeckerei')).toBeNull();
  });
});

describe('basket reconciliation', () => {
  it('reports removed, reduced and repriced items', () => {
    let b = addItem(base(), product({ id: 'gone', name: 'Weg', remaining: 5 }), 1);
    b = addItem(b, product({ id: 'less', name: 'Knapp', remaining: 10 }), 5);
    b = addItem(b, product({ id: 'price', name: 'Teurer', price: 2, remaining: 10 }), 1);
    b = addItem(b, product({ id: 'same', name: 'Gleich', remaining: 10 }), 1);

    const { basket, changes } = reconcileBasket(b, [
      product({ id: 'less', name: 'Knapp', remaining: 2 }),
      product({ id: 'price', name: 'Teurer', price: 2.5, remaining: 10 }),
      product({ id: 'same', name: 'Gleich', remaining: 10 }),
    ]);

    expect(changes).toEqual([
      { type: 'removed', productId: 'gone', name: 'Weg' },
      { type: 'reduced', productId: 'less', name: 'Knapp', from: 5, to: 2 },
      { type: 'price', productId: 'price', name: 'Teurer', fromCents: 200, toCents: 250 },
    ]);
    expect(basket.items.map((i) => [i.productId, i.quantity])).toEqual([
      ['less', 2],
      ['price', 1],
      ['same', 1],
    ]);
    expect(basketTotalCents(basket)).toBe(2 * 190 + 250 + 190);
  });

  it('removes items that are sold out now and returns the same basket when nothing changed', () => {
    const b = addItem(base(), product({ id: 'a', remaining: 5 }), 1);
    expect(reconcileBasket(b, [product({ id: 'a', remaining: 0, availability: 'SoldOut' })]).basket.items).toHaveLength(0);
    const unchanged = reconcileBasket(b, [product({ id: 'a', remaining: 5 })]);
    expect(unchanged.changes).toHaveLength(0);
    expect(unchanged.basket).toBe(b);
  });
});
