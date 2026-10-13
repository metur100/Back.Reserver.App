import type { PublicProductDto } from '@/api/types';
import { toCents } from '@/utils/format';

/**
 * Basket model: exactly one bakery + location + pickup date. All money is kept in integer cents.
 * Prices are only for display; the server computes the authoritative total (no prices are sent with the order).
 */
export interface BasketLine {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  /** Last known remaining stock, used to cap the stepper. */
  maxQuantity: number;
  imageUrl: string | null;
}

export interface Basket {
  slug: string;
  locationId: string | null;
  date: string | null;
  lines: BasketLine[];
  updatedAt: number;
}

export const MAX_LINE_QUANTITY = 200;

export function emptyBasket(slug: string): Basket {
  return { slug, locationId: null, date: null, lines: [], updatedAt: Date.now() };
}

export function basketCount(basket: Basket): number {
  return basket.lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function lineTotalCents(line: BasketLine): number {
  return line.unitPriceCents * line.quantity;
}

export function basketTotalCents(basket: Basket): number {
  return basket.lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
}

export function quantityOf(basket: Basket, productId: string): number {
  return basket.lines.find((l) => l.productId === productId)?.quantity ?? 0;
}

function maxFor(product: PublicProductDto): number {
  if (product.availability === 'SoldOut') return 0;
  return Math.max(0, Math.min(product.remaining, MAX_LINE_QUANTITY));
}

/** Sets the quantity of a product (clamped to 0..remaining). Quantity 0 removes the line. */
export function setQuantity(basket: Basket, product: PublicProductDto, quantity: number): Basket {
  const max = maxFor(product);
  const q = Math.max(0, Math.min(Math.floor(quantity), max));
  const others = basket.lines.filter((l) => l.productId !== product.id);
  const existingIndex = basket.lines.findIndex((l) => l.productId === product.id);
  if (q === 0) return { ...basket, lines: others, updatedAt: Date.now() };
  const line: BasketLine = {
    productId: product.id,
    name: product.name,
    unitPriceCents: toCents(product.price),
    quantity: q,
    maxQuantity: max,
    imageUrl: product.imageUrl,
  };
  const lines = [...basket.lines];
  if (existingIndex >= 0) lines[existingIndex] = line;
  else lines.push(line);
  return { ...basket, lines, updatedAt: Date.now() };
}

export function removeLine(basket: Basket, productId: string): Basket {
  return { ...basket, lines: basket.lines.filter((l) => l.productId !== productId), updatedAt: Date.now() };
}

/** Caps a line to a known remaining quantity (e.g. from an insufficient_stock error). 0 removes it. */
export function capLine(basket: Basket, productId: string, remaining: number): Basket {
  const lines = basket.lines
    .map((l) => (l.productId === productId ? { ...l, quantity: Math.min(l.quantity, remaining), maxQuantity: remaining } : l))
    .filter((l) => l.quantity > 0);
  return { ...basket, lines, updatedAt: Date.now() };
}

export function withContext(basket: Basket, locationId: string, date: string): Basket {
  if (basket.locationId === locationId && basket.date === date) return basket;
  return { ...basket, locationId, date, updatedAt: Date.now() };
}

export type BasketChange =
  | { type: 'removed'; productId: string; name: string }
  | { type: 'reduced'; productId: string; name: string; quantity: number }
  | { type: 'price'; productId: string; name: string; fromCents: number; toCents: number };

/**
 * Re-validates the basket against fresh product data for its location/date: removes products that are no longer
 * offered or sold out, reduces quantities above remaining stock and refreshes names and prices.
 */
export function reconcileBasket(basket: Basket, products: readonly PublicProductDto[]): { basket: Basket; changes: BasketChange[] } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const changes: BasketChange[] = [];
  const lines: BasketLine[] = [];
  for (const line of basket.lines) {
    const product = byId.get(line.productId);
    const max = product ? maxFor(product) : 0;
    if (!product || max === 0) {
      changes.push({ type: 'removed', productId: line.productId, name: product?.name ?? line.name });
      continue;
    }
    const priceCents = toCents(product.price);
    if (priceCents !== line.unitPriceCents) {
      changes.push({ type: 'price', productId: line.productId, name: product.name, fromCents: line.unitPriceCents, toCents: priceCents });
    }
    let quantity = line.quantity;
    if (quantity > max) {
      quantity = max;
      changes.push({ type: 'reduced', productId: line.productId, name: product.name, quantity: max });
    }
    lines.push({ ...line, name: product.name, unitPriceCents: priceCents, quantity, maxQuantity: max, imageUrl: product.imageUrl });
  }
  if (changes.length === 0 && lines.every((l, i) => l.maxQuantity === basket.lines[i]?.maxQuantity)) return { basket, changes };
  return { basket: { ...basket, lines, updatedAt: Date.now() }, changes };
}

export function toOrderItems(basket: Basket) {
  return basket.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
}
