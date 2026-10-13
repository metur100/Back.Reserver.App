/**
 * Pickup code (public order reference) helpers, mirroring the backend's Codes.NormalizeReference:
 * "br 7k4m9x", "7K4M9X", "BR-7K4M9X" → "BR-7K4M9X".
 */
export const REFERENCE_PREFIX = 'BR-';
export const REFERENCE_LENGTH = 6;
/** No 0/O, 1/I/L so codes can be read out over the counter without confusion. */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function normalizePickupCode(input: string): string {
  let cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.startsWith('BR') && cleaned.length === REFERENCE_LENGTH + 2) cleaned = cleaned.slice(2);
  return REFERENCE_PREFIX + cleaned;
}

/** True when the normalised code has the expected shape (6 characters of the reference alphabet). */
export function isValidPickupCode(input: string): boolean {
  const code = normalizePickupCode(input).slice(REFERENCE_PREFIX.length);
  return code.length === REFERENCE_LENGTH && [...code].every((c) => REFERENCE_ALPHABET.includes(c));
}

/**
 * Extracts a pickup code from scanned QR content. The app's own QR codes contain only the reference, but a scanned
 * confirmation link (…/bestellung/BR-XXXXXX…) is accepted as well. Returns null when nothing code-like is found.
 */
export function extractPickupCode(scanned: string): string | null {
  const text = scanned.trim();
  const match = /BR-?([2-9A-HJKMNP-Z]{6})(?![A-Z0-9])/i.exec(text);
  if (match) return REFERENCE_PREFIX + match[1]!.toUpperCase();
  if (isValidPickupCode(text)) return normalizePickupCode(text);
  return null;
}
