import { z } from 'zod';
import { t } from '@/i18n';
import { EMAIL_REGEX } from '@/features/public/checkoutSchema';

/** Mirrors Rules.StrongPassword. */
export const strongPassword = z
  .string()
  .min(1, t('validation.passwordRequired'))
  .min(10, t('validation.passwordMin'))
  .max(128, t('validation.maxLength', { max: 128 }))
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), t('validation.passwordMix'));

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const loginSchema = z.object({
  email: z.string().trim().min(1, t('validation.loginEmail')).max(254),
  password: z.string().min(1, t('validation.loginPassword')).max(128),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, t('validation.adminFirstName')).max(80),
  lastName: z.string().trim().min(1, t('validation.adminLastName')).max(80),
  email: z.string().trim().min(1, t('validation.adminEmail')).max(254).regex(EMAIL_REGEX, t('validation.adminEmail')),
  password: strongPassword,
  bakeryName: z.string().trim().min(1, t('validation.bakeryName')).max(120),
  slug: z
    .string()
    .trim()
    .max(60, t('validation.maxLength', { max: 60 }))
    .refine((s) => s === '' || SLUG_REGEX.test(s), t('validation.slug')),
  acceptTerms: z.boolean().refine((v) => v, t('validation.acceptTermsAdmin')),
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const emailOnlySchema = z.object({
  email: z.string().trim().min(1, t('validation.adminEmail')).max(254).regex(EMAIL_REGEX, t('validation.adminEmail')),
});

export const newPasswordSchema = z
  .object({ password: strongPassword, repeat: z.string() })
  .refine((v) => v.password === v.repeat, { message: t('validation.passwordMismatch'), path: ['repeat'] });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

/** Client mirror of Codes.Slugify (preview only; the server decides). */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
