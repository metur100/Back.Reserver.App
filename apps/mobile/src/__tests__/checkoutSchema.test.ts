import { createCheckoutSchema, emptyCheckoutForm, serverFieldToFormField } from '@/checkout/schema';

function messages(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const out: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe('checkout schema (German messages)', () => {
  const valid = {
    firstName: 'Anna',
    lastName: 'Becker',
    email: 'anna@example.de',
    phone: '0211 123456',
    note: '',
    acceptTerms: true,
  };

  it('accepts valid input and trims values', () => {
    const r = createCheckoutSchema({ requireLastName: true, requirePhone: false }).safeParse({ ...valid, firstName: '  Anna ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.firstName).toBe('Anna');
  });

  it('reports missing required fields in German', () => {
    const r = createCheckoutSchema({ requireLastName: true, requirePhone: true }).safeParse(emptyCheckoutForm);
    expect(messages(r)).toEqual({
      firstName: 'Bitte gib deinen Vornamen an.',
      lastName: 'Bitte gib deinen Nachnamen an.',
      email: 'Bitte gib deine E-Mail-Adresse an.',
      phone: 'Bitte gib deine Telefonnummer an.',
      acceptTerms: 'Bitte bestätige die Bedingungen und Datenschutzhinweise.',
    });
  });

  it('makes last name and phone optional unless the bakery requires them', () => {
    const schema = createCheckoutSchema({ requireLastName: false, requirePhone: false });
    expect(schema.safeParse({ ...valid, lastName: '', phone: '' }).success).toBe(true);
  });

  it('validates email, phone and note length', () => {
    const r = createCheckoutSchema({ requireLastName: false, requirePhone: false }).safeParse({
      ...valid,
      email: 'anna@',
      phone: 'abc',
      note: 'x'.repeat(501),
    });
    expect(messages(r)).toEqual({
      email: 'Bitte gib eine gültige E-Mail-Adresse an.',
      phone: 'Bitte gib eine gültige Telefonnummer an.',
      note: 'Die Anmerkung darf höchstens 500 Zeichen lang sein.',
    });
  });

  it('maps server validation keys to form fields', () => {
    expect(serverFieldToFormField('customer.FirstName')).toBe('firstName');
    expect(serverFieldToFormField('customer.firstName')).toBe('firstName');
    expect(serverFieldToFormField('customer.Email')).toBe('email');
    expect(serverFieldToFormField('note')).toBe('note');
    expect(serverFieldToFormField('acceptTerms')).toBe('acceptTerms');
    expect(serverFieldToFormField('items')).toBeNull();
  });
});
