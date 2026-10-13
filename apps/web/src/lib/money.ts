import { intlLocale } from '@/i18n';

/** Converts an API decimal (e.g. 2.2) to integer cents without float drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const formatters = new Map<string, Intl.NumberFormat>();
function currencyFormatter(currency: string) {
  const key = `${intlLocale()}:${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(), { style: 'currency', currency });
    formatters.set(key, f);
  }
  return f;
}

/** Formats an API amount (euros as decimal number). */
export function formatMoney(amount: number, currency = 'EUR'): string {
  return currencyFormatter(currency).format(amount);
}

export function formatCents(cents: number, currency = 'EUR'): string {
  return currencyFormatter(currency).format(fromCents(cents));
}

/**
 * Parses German decimal input ("2,50", "2.50", "1.234,50", "3 €") into cents.
 * Returns null for invalid input or more than two decimals.
 */
export function parseGermanPriceToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, '');
  if (s === '') return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(s)) normalized = s.replace(',', '.');
  else if (/^\d+(\.\d{1,2})?$/.test(s)) normalized = s;
  else return null;
  const [whole = '0', frac = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Formats cents for an editable German input ("2,50"). */
export function centsToGermanInput(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = Math.abs(cents % 100)
    .toString()
    .padStart(2, '0');
  return `${euros},${rest}`;
}
