import { z } from 'zod';
import { t } from '@/i18n';

/** Mirrors Rules.PhoneRegex on the server. */
export const PHONE_REGEX = /^[0-9 +()\-/]{5,30}$/;
/** Pragmatic e-mail check (the server additionally validates). */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NOTE = 500;

export interface ContactSchemaOptions {
  requireLastName: boolean;
  requirePhone: boolean;
}

/** Contact step of the checkout; messages match CustomerDetailsValidator / ReservationService. */
export function createContactSchema({ requireLastName, requirePhone }: ContactSchemaOptions) {
  return z.object({
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')).max(80, t('validation.maxLength', { max: 80 })),
    lastName: requireLastName
      ? z.string().trim().min(1, t('validation.lastNameRequired')).max(80, t('validation.maxLength', { max: 80 }))
      : z.string().trim().max(80, t('validation.maxLength', { max: 80 })),
    email: z
      .string()
      .trim()
      .min(1, t('validation.emailRequired'))
      .max(254, t('validation.maxLength', { max: 254 }))
      .regex(EMAIL_REGEX, t('validation.emailInvalid')),
    phone: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value === '') {
          if (requirePhone) ctx.addIssue({ code: 'custom', message: t('validation.phoneRequired') });
          return;
        }
        if (!PHONE_REGEX.test(value)) ctx.addIssue({ code: 'custom', message: t('validation.phoneInvalid') });
      }),
    note: z.string().max(MAX_NOTE, t('validation.noteTooLong')),
  });
}

export type ContactFormValues = z.infer<ReturnType<typeof createContactSchema>>;

export const termsSchema = z.object({
  acceptTerms: z.boolean().refine((v) => v, t('validation.acceptTerms')),
});

/** Maps server validation keys (camelCase paths like "customer.firstName") to contact form fields. */
export function mapServerFieldToContact(path: string): keyof ContactFormValues | null {
  const key = path.replace(/^customer\./i, '');
  const fields: (keyof ContactFormValues)[] = ['firstName', 'lastName', 'email', 'phone', 'note'];
  return fields.find((f) => f.toLowerCase() === key.toLowerCase()) ?? null;
}
