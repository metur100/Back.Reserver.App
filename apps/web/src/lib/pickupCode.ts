/** Alphabet used by the backend for public references (no 0/O, 1/I/L). */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PREFIX = 'BR-';
const LENGTH = 6;

/**
 * Normalises staff input ("br 7k4m9x", "7K4M9X", "BR-7K4M9X") to the canonical "BR-7K4M9X".
 * Mirrors Codes.NormalizeReference on the server.
 */
export function normalizePickupCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let core = cleaned;
  if (core.startsWith('BR') && core.length === LENGTH + 2) core = core.slice(2);
  return PREFIX + core;
}

/** Extracts a reference from arbitrary scanned text (e.g. a QR payload), or null. */
export function extractPickupCode(text: string): string | null {
  const upper = text.toUpperCase();
  const match = upper.match(/BR[-\s]?([2-9A-HJKMNP-Z]{6})(?![A-Z0-9])/);
  if (match) return PREFIX + match[1];
  const bare = upper.trim();
  if (/^[2-9A-HJKMNP-Z]{6}$/.test(bare)) return PREFIX + bare;
  return null;
}

/** True when the normalised code has the expected shape. */
export function isPlausiblePickupCode(code: string): boolean {
  return new RegExp(`^BR-[${REFERENCE_ALPHABET}]{${LENGTH}}$`).test(code);
}

/** Formats input while typing: uppercase, only letters/digits/dash/space, bounded length. */
export function formatPickupCodeInput(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9\- ]/g, '')
    .slice(0, 12);
}
