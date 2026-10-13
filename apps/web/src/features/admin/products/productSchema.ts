import { z } from 'zod';
import type { ProductDto, UpsertProductRequest } from '@/api/types';
import { t } from '@/i18n';
import { centsToGermanInput, parseGermanPriceToCents, toCents } from '@/lib/money';

const intIn = (min: number, max: number, message: string) =>
  z.string().trim().refine((v) => /^-?\d+$/.test(v) && Number(v) >= min && Number(v) <= max, message);

/** Mirrors Rules.IsSafeUrl: empty, "/media/…" or an absolute https URL. */
export function isSafeImageUrl(url: string): boolean {
  if (!url.trim()) return true;
  if (url.startsWith('/media/')) return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Product form (UpsertProductRequestValidator). Numeric fields are edited as strings (German decimals). */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, t('validation.productName')).max(120, t('validation.maxLength', { max: 120 })),
  description: z.string().max(1000, t('validation.maxLength', { max: 1000 })),
  categoryId: z.string(),
  price: z
    .string()
    .superRefine((value, ctx) => {
      const cents = parseGermanPriceToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: /[.,]\d{3,}$/.test(value.trim()) ? t('validation.priceDecimals') : t('validation.priceFormat') });
        return;
      }
      if (cents < 0 || cents > 999_999) ctx.addIssue({ code: 'custom', message: t('validation.price') });
    }),
  imageUrl: z.string().max(500, t('validation.maxLength', { max: 500 })).refine(isSafeImageUrl, t('validation.url')),
  allergens: z.string().max(1000, t('validation.maxLength', { max: 1000 })),
  ingredients: z.string().max(2000, t('validation.maxLength', { max: 2000 })),
  dietaryLabels: z.array(z.string()).refine((l) => l.length <= 10 && l.every((s) => s.length <= 40), t('validation.labels')),
  leadTimeHours: intIn(0, 720, t('validation.leadTime')),
  defaultDailyQuantity: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 100_000), t('validation.integer')),
  sortOrder: intIn(-10_000, 10_000, t('validation.integer')),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const emptyProductForm: ProductFormValues = {
  name: '',
  description: '',
  categoryId: '',
  price: '',
  imageUrl: '',
  allergens: '',
  ingredients: '',
  dietaryLabels: [],
  leadTimeHours: '0',
  defaultDailyQuantity: '',
  sortOrder: '0',
};

export function productToForm(p: ProductDto): ProductFormValues {
  return {
    name: p.name,
    description: p.description ?? '',
    categoryId: p.categoryId ?? '',
    price: centsToGermanInput(toCents(p.basePrice)),
    imageUrl: p.imageUrl ?? '',
    allergens: p.allergens ?? '',
    ingredients: p.ingredients ?? '',
    dietaryLabels: p.dietaryLabels,
    leadTimeHours: String(p.leadTimeHours),
    defaultDailyQuantity: p.defaultDailyQuantity === null ? '' : String(p.defaultDailyQuantity),
    sortOrder: String(p.sortOrder),
  };
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function formToUpsert(v: ProductFormValues): UpsertProductRequest {
  return {
    name: v.name.trim(),
    description: orNull(v.description),
    categoryId: v.categoryId || null,
    basePrice: (parseGermanPriceToCents(v.price) ?? 0) / 100,
    imageUrl: orNull(v.imageUrl),
    allergens: orNull(v.allergens),
    ingredients: orNull(v.ingredients),
    dietaryLabels: v.dietaryLabels.length ? v.dietaryLabels : null,
    leadTimeHours: Number(v.leadTimeHours),
    defaultDailyQuantity: v.defaultDailyQuantity.trim() === '' ? null : Number(v.defaultDailyQuantity),
    sortOrder: Number(v.sortOrder),
  };
}
