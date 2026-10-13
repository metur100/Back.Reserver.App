import { describe, expect, it } from 'vitest';
import { createContactSchema, mapServerFieldToContact } from './checkoutSchema';

const valid = { firstName: 'Lena', lastName: 'Schneider', email: 'lena@example.de', phone: '', note: '' };

function messages(result: ReturnType<ReturnType<typeof createContactSchema>['safeParse']>) {
  return result.success ? {} : Object.fromEntries([...result.error.issues].reverse().map((i) => [i.path.join('.'), i.message]));
}

describe('checkout contact schema', () => {
  it('accepts valid data', () => {
    expect(createContactSchema({ requireLastName: true, requirePhone: false }).safeParse(valid).success).toBe(true);
  });

  it('uses the server-side German messages', () => {
    const schema = createContactSchema({ requireLastName: false, requirePhone: false });
    const result = schema.safeParse({ ...valid, firstName: ' ', email: 'kein-at' });
    expect(messages(result)).toMatchObject({
      firstName: 'Bitte gib deinen Vornamen an.',
      email: 'Bitte gib eine gültige E-Mail-Adresse an.',
    });
    expect(messages(schema.safeParse({ ...valid, email: '' })).email).toBe('Bitte gib deine E-Mail-Adresse an.');
  });

  it('requires the last name only when the bakery demands it', () => {
    expect(createContactSchema({ requireLastName: false, requirePhone: false }).safeParse({ ...valid, lastName: '' }).success).toBe(true);
    const result = createContactSchema({ requireLastName: true, requirePhone: false }).safeParse({ ...valid, lastName: '' });
    expect(messages(result).lastName).toBe('Bitte gib deinen Nachnamen an.');
  });

  it('validates phone format and the optional phone requirement', () => {
    const optional = createContactSchema({ requireLastName: false, requirePhone: false });
    expect(optional.safeParse({ ...valid, phone: '0211 123456' }).success).toBe(true);
    expect(messages(optional.safeParse({ ...valid, phone: 'abc' })).phone).toBe('Bitte gib eine gültige Telefonnummer an.');
    const required = createContactSchema({ requireLastName: false, requirePhone: true });
    expect(messages(required.safeParse({ ...valid, phone: '' })).phone).toBe('Bitte gib deine Telefonnummer an.');
  });

  it('limits the note to 500 characters', () => {
    const schema = createContactSchema({ requireLastName: false, requirePhone: false });
    expect(schema.safeParse({ ...valid, note: 'x'.repeat(500) }).success).toBe(true);
    expect(messages(schema.safeParse({ ...valid, note: 'x'.repeat(501) })).note).toBe('Die Anmerkung darf höchstens 500 Zeichen lang sein.');
  });

  it('maps server field paths to form fields', () => {
    expect(mapServerFieldToContact('customer.firstName')).toBe('firstName');
    expect(mapServerFieldToContact('note')).toBe('note');
    expect(mapServerFieldToContact('items')).toBeNull();
  });
});
