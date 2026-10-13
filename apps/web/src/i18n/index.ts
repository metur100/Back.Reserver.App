import { de, type Dictionary } from './de';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;
export type TranslationParams = Record<string, string | number>;

const dictionaries = { de } as const;
export type Locale = keyof typeof dictionaries;

let activeLocale: Locale = 'de';
export const setLocale = (locale: Locale) => {
  activeLocale = locale;
};
export const getLocale = (): Locale => activeLocale;
/** BCP-47 tag used for Intl formatting. */
export const intlLocale = () => (activeLocale === 'de' ? 'de-DE' : activeLocale);

function lookup(key: string): string | undefined {
  let node: unknown = dictionaries[activeLocale];
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Translate a key. Placeholders "{name}" are replaced from params.
 * Values of the form "singular|plural" are chosen by params.count (1 → singular).
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  let value = lookup(key);
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] Missing key: ${key}`);
    return key;
  }
  if (value.includes('|') && params && typeof params.count === 'number') {
    const [one, other] = value.split('|');
    value = (params.count === 1 ? one : other) ?? value;
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    return typeof v === 'number' ? new Intl.NumberFormat(intlLocale()).format(v) : v;
  });
}

/** Translate a key when it is only known at runtime (e.g. enum values); falls back to the raw value. */
export function tDynamic(prefix: string, value: string, params?: TranslationParams): string {
  const key = `${prefix}.${value}`;
  return lookup(key) !== undefined ? t(key as TranslationKey, params) : value;
}
