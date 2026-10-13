import { z } from 'zod';
import type { DayOfWeek, LocationDto, ScheduleRuleDto, UpsertLocationRequest } from '@/api/types';
import { t } from '@/i18n';
import { PHONE_REGEX, EMAIL_REGEX } from '@/features/public/checkoutSchema';
import { timeToMinutes } from '@/lib/format';

export const TIME_ZONES = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Luxembourg',
  'Europe/Paris',
  'Europe/Copenhagen',
  'Europe/Prague',
  'Europe/Warsaw',
  'Europe/Ljubljana',
  'Europe/Zagreb',
  'Europe/Sarajevo',
  'Europe/Belgrade',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/London',
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const int = (min: number, max: number, message: string) => z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, message);

export const locationFormSchema = z.object({
  name: z.string().trim().min(1, t('validation.locationName')).max(120),
  street: z.string().trim().min(1, t('validation.street')).max(200),
  postalCode: z.string().trim().min(1, t('validation.postalCode')).max(10),
  city: z.string().trim().min(1, t('validation.city')).max(100),
  country: z.string().trim().max(2, t('validation.maxLength', { max: 2 })),
  phone: z.string().trim().refine((v) => v === '' || PHONE_REGEX.test(v), t('validation.phoneAdmin')),
  email: z.string().trim().refine((v) => v === '' || EMAIL_REGEX.test(v), t('validation.emailAdmin')),
  isActive: z.boolean(),
  timeZoneId: z.string().min(1),
  acceptsOrders: z.boolean(),
  orderCutoffDaysBefore: int(0, 14, t('validation.cutoffDays')),
  orderCutoffTime: z.string().regex(TIME, t('validation.time')),
  minAdvanceMinutes: int(0, 10_080, t('validation.minAdvance')),
  maxDaysAhead: int(1, 90, t('validation.maxDaysAhead')),
  cancellationCutoffDaysBefore: int(0, 14, t('validation.cancellationDays')),
  cancellationCutoffTime: z.string().regex(TIME, t('validation.time')),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;

export const emptyLocationForm: LocationFormValues = {
  name: '',
  street: '',
  postalCode: '',
  city: '',
  country: 'DE',
  phone: '',
  email: '',
  isActive: true,
  timeZoneId: 'Europe/Berlin',
  acceptsOrders: true,
  orderCutoffDaysBefore: '1',
  orderCutoffTime: '18:00',
  minAdvanceMinutes: '60',
  maxDaysAhead: '14',
  cancellationCutoffDaysBefore: '1',
  cancellationCutoffTime: '18:00',
};

export function locationToForm(l: LocationDto): LocationFormValues {
  const s = l.settings;
  return {
    name: l.name,
    street: l.street,
    postalCode: l.postalCode,
    city: l.city,
    country: l.country,
    phone: l.phone ?? '',
    email: l.email ?? '',
    isActive: l.isActive,
    timeZoneId: s.timeZoneId,
    acceptsOrders: s.acceptsOrders,
    orderCutoffDaysBefore: String(s.orderCutoffDaysBefore),
    orderCutoffTime: s.orderCutoffTime,
    minAdvanceMinutes: String(s.minAdvanceMinutes),
    maxDaysAhead: String(s.maxDaysAhead),
    cancellationCutoffDaysBefore: String(s.cancellationCutoffDaysBefore),
    cancellationCutoffTime: s.cancellationCutoffTime,
  };
}

const hhmm = (v: string) => v.slice(0, 5);

export function formToLocationRequest(v: LocationFormValues): UpsertLocationRequest {
  return {
    name: v.name.trim(),
    street: v.street.trim(),
    postalCode: v.postalCode.trim(),
    city: v.city.trim(),
    country: v.country.trim() || null,
    phone: v.phone.trim() || null,
    email: v.email.trim() || null,
    isActive: v.isActive,
    settings: {
      timeZoneId: v.timeZoneId,
      acceptsOrders: v.acceptsOrders,
      orderCutoffDaysBefore: Number(v.orderCutoffDaysBefore),
      orderCutoffTime: hhmm(v.orderCutoffTime),
      minAdvanceMinutes: Number(v.minAdvanceMinutes),
      maxDaysAhead: Number(v.maxDaysAhead),
      cancellationCutoffDaysBefore: Number(v.cancellationCutoffDaysBefore),
      cancellationCutoffTime: hhmm(v.cancellationCutoffTime),
    },
  };
}

// ---------- Weekly schedule ----------

export interface ScheduleRowDraft {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
  pickupStart: string;
  pickupEnd: string;
  slotMinutes: string;
  maxOrdersPerSlot: string;
  maxItemsPerSlot: string;
}

export function ruleToDraft(r: ScheduleRuleDto): ScheduleRowDraft {
  return {
    dayOfWeek: r.dayOfWeek,
    isOpen: r.isOpen,
    opensAt: r.opensAt ?? '',
    closesAt: r.closesAt ?? '',
    pickupStart: r.pickupStart,
    pickupEnd: r.pickupEnd,
    slotMinutes: String(r.slotMinutes),
    maxOrdersPerSlot: String(r.maxOrdersPerSlot),
    maxItemsPerSlot: r.maxItemsPerSlot === null ? '' : String(r.maxItemsPerSlot),
  };
}

/** Mirrors UpdateScheduleRequestValidator for one day; returns field → message. */
export function validateScheduleRow(d: ScheduleRowDraft): Partial<Record<keyof ScheduleRowDraft, string>> {
  const errors: Partial<Record<keyof ScheduleRowDraft, string>> = {};
  const isInt = (s: string) => /^\d+$/.test(s.trim());
  const slot = Number(d.slotMinutes);
  if (!isInt(d.slotMinutes) || slot < 5 || slot > 240) errors.slotMinutes = t('validation.slotMinutes');
  const orders = Number(d.maxOrdersPerSlot);
  if (!isInt(d.maxOrdersPerSlot) || orders < 1 || orders > 1000) errors.maxOrdersPerSlot = t('validation.maxOrders');
  if (d.maxItemsPerSlot.trim() !== '' && (!isInt(d.maxItemsPerSlot) || Number(d.maxItemsPerSlot) < 1 || Number(d.maxItemsPerSlot) > 100_000))
    errors.maxItemsPerSlot = t('validation.maxItems');
  if (!TIME.test(d.pickupStart)) errors.pickupStart = t('validation.time');
  if (!TIME.test(d.pickupEnd)) errors.pickupEnd = t('validation.time');
  if (d.opensAt && !TIME.test(d.opensAt)) errors.opensAt = t('validation.time');
  if (d.closesAt && !TIME.test(d.closesAt)) errors.closesAt = t('validation.time');
  if (d.isOpen && !errors.pickupStart && !errors.pickupEnd) {
    const window = timeToMinutes(d.pickupEnd) - timeToMinutes(d.pickupStart);
    if (window <= 0) errors.pickupEnd = t('validation.pickupEndAfterStart');
    else if (!errors.slotMinutes && window < slot) errors.pickupEnd = t('validation.pickupWindowTooShort');
  }
  return errors;
}

export function draftToRule(d: ScheduleRowDraft): ScheduleRuleDto {
  return {
    dayOfWeek: d.dayOfWeek,
    isOpen: d.isOpen,
    opensAt: d.opensAt ? hhmm(d.opensAt) : null,
    closesAt: d.closesAt ? hhmm(d.closesAt) : null,
    pickupStart: hhmm(d.pickupStart),
    pickupEnd: hhmm(d.pickupEnd),
    slotMinutes: Number(d.slotMinutes),
    maxOrdersPerSlot: Number(d.maxOrdersPerSlot),
    maxItemsPerSlot: d.maxItemsPerSlot.trim() === '' ? null : Number(d.maxItemsPerSlot),
  };
}
