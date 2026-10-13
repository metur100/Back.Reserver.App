/** Parsing of bakery links / slugs entered or pasted by customers, and deep link builders. */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return value.length >= 2 && value.length <= 80 && SLUG_RE.test(value);
}

/**
 * Accepts "baeckerei-rheinblick", "Baeckerei-Rheinblick ", "https://app.backreserve.example/b/baeckerei-rheinblick",
 * "app.backreserve.example/b/baeckerei-rheinblick?x=1" or "backreserve://b/baeckerei-rheinblick" and returns the slug.
 */
export function parseBakeryInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const pathMatch = /(?:^|\/)b\/([A-Za-z0-9-]+)(?:[/?#]|$)/.exec(raw);
  const candidate = (pathMatch ? pathMatch[1]! : raw).toLowerCase();
  return isValidSlug(candidate) ? candidate : null;
}

export function bakeryDeepLink(slug: string): string {
  return `backreserve://b/${encodeURIComponent(slug)}`;
}

export function orderDeepLink(reference: string, token: string): string {
  return `backreserve://bestellung/${encodeURIComponent(reference)}?t=${encodeURIComponent(token)}`;
}

/**
 * Confirmation e-mails link to `{web}/bestellung/{ref}#t={token}`. URL fragments are not passed to routes, so the
 * native intent handler rewrites `#t=` into a `?t=` query parameter.
 */
export function rewriteFragmentToken(path: string): string {
  const hashIndex = path.indexOf('#');
  if (hashIndex < 0) return path;
  const fragment = path.slice(hashIndex + 1);
  const base = path.slice(0, hashIndex);
  const tokenMatch = /(?:^|&)t=([^&]+)/.exec(fragment);
  if (!tokenMatch) return base;
  return `${base}${base.includes('?') ? '&' : '?'}t=${tokenMatch[1]}`;
}
