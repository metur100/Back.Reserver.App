import { z } from 'zod';
import { de } from '@/i18n/de';

export const MAX_NOTE_LENGTH = 500;
/** Same pattern as the backend (Validators.cs Rules.PhoneRegex). */
const PHONE_RE = /^[0-9 +()\-/]{5,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CheckoutRules {
  requireLastName: boolean;
  requirePhone: boolean;
}

/** Contact + terms form schema with German messages mirroring the backend validators. */
export function createCheckoutSchema(rules: CheckoutRules) {
  const v = de.validation;
  return z.object({
    firstName: z.string().trim().min(1, v.firstNameRequired).max(80, v.maxLength(80)),
    lastName: rules.requireLastName
      ? z.string().trim().min(1, v.lastNameRequired).max(80, v.maxLength(80))
      : z.string().trim().max(80, v.maxLength(80)),
    email: z.string().trim().min(1, v.emailRequired).max(254, v.maxLength(254)).regex(EMAIL_RE, v.emailInvalid),
    phone: rules.requirePhone
      ? z.string().trim().min(1, v.phoneRequired).regex(PHONE_RE, v.phoneInvalid)
      : z.string().trim().refine((s) => s === '' || PHONE_RE.test(s), v.phoneInvalid),
    note: z.string().max(MAX_NOTE_LENGTH, v.noteTooLong),
    acceptTerms: z.boolean().refine((x) => x === true, v.termsRequired),
  });
}

export type CheckoutSchema = ReturnType<typeof createCheckoutSchema>;
export type CheckoutFormValues = z.input<CheckoutSchema>;
export type CheckoutFormOutput = z.output<CheckoutSchema>;

export const emptyCheckoutForm: CheckoutFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  note: '',
  acceptTerms: false,
};

/** Maps server validation keys ("customer.FirstName", "note") to form fields. */
export function serverFieldToFormField(key: string): keyof CheckoutFormValues | null {
  const k = key.toLowerCase();
  if (k.endsWith('firstname')) return 'firstName';
  if (k.endsWith('lastname')) return 'lastName';
  if (k.endsWith('email')) return 'email';
  if (k.endsWith('phone')) return 'phone';
  if (k === 'note') return 'note';
  if (k === 'acceptterms') return 'acceptTerms';
  return null;
}
