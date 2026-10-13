import { extractPickupCode, isValidPickupCode, normalizePickupCode } from '@/utils/pickupCode';

describe('pickup code normalisation', () => {
  it.each([
    ['br 7k4m9x', 'BR-7K4M9X'],
    ['BR-7K4M9X', 'BR-7K4M9X'],
    ['7k4m9x', 'BR-7K4M9X'],
    ['  br-7k 4m9x ', 'BR-7K4M9X'],
    ['br7k4m9x', 'BR-7K4M9X'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePickupCode(input)).toBe(expected);
  });

  it('keeps a 6-character code starting with BR intact', () => {
    expect(normalizePickupCode('BR2345')).toBe('BR-BR2345');
  });

  it('validates length and alphabet (no 0/O/1/I/L)', () => {
    expect(isValidPickupCode('br 7k4m9x')).toBe(true);
    expect(isValidPickupCode('7K4M9')).toBe(false);
    expect(isValidPickupCode('BR-7K4M90')).toBe(false);
    expect(isValidPickupCode('BR-7K4MIX')).toBe(false);
  });

  it('extracts codes from scanned QR content', () => {
    expect(extractPickupCode('BR-7K4M9X')).toBe('BR-7K4M9X');
    expect(extractPickupCode('https://app.backreserve.example/bestellung/BR-7K4M9X#t=abc')).toBe('BR-7K4M9X');
    expect(extractPickupCode('7k4m9x')).toBe('BR-7K4M9X');
    expect(extractPickupCode('hello world')).toBeNull();
  });
});
