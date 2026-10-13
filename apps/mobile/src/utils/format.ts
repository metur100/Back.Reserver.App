/**
 * de-DE formatting helpers implemented without Intl.
 *
 * Hermes ships only partial Intl support on some React Native versions / Android builds (locale data and time zones
 * may be missing), so money, dates and times are formatted by hand. All business times are Europe/Berlin wall-clock
 * times, which the backend already returns for DateOnly / TimeOnly values. DateTimeOffset values (e.g. cancellation
 * deadlines) are converted to Berlin time with the EU daylight-saving rule.
 */
import { de } from '@/i18n/de';

// ---------- money (integer cents) ----------

/** Converts a decimal amount from the API (e.g. 1.9) to integer cents without floating point drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** 1234567 → "12.345,67 €" (non-breaking space before the euro sign, as in de-DE). */
export function formatCents(cents: number, currency = 'EUR'): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const symbol = currency === 'EUR' ? '€' : currency;
  return `${negative ? '-' : ''}${grouped},${String(rest).padStart(2, '0')} ${symbol}`;
}

export function formatMoney(amount: number, currency = 'EUR'): string {
  return formatCents(toCents(amount), currency);
}

// ---------- DateOnly "yyyy-MM-dd" ----------

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export function parseDateOnly(value: string): DateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid date: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toDateOnly(p: DateParts): string {
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Day of week for a calendar date (0 = Sunday), independent of the device time zone. */
export function weekdayOf(value: string): number {
  const { year, month, day } = parseDateOnly(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(value: string, days: number): string {
  const { year, month, day } = parseDateOnly(value);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateOnly({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** "2026-10-14" → "14.10.2026" */
export function formatDate(value: string): string {
  const { year, month, day } = parseDateOnly(value);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

/** "2026-10-14" → "Mi., 14.10." */
export function formatDateShort(value: string): string {
  const { month, day } = parseDateOnly(value);
  return `${de.weekdaysShort[weekdayOf(value)]}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`;
}

/** "2026-10-14" → "Mittwoch, 14. Oktober 2026" */
export function formatDateLong(value: string): string {
  const { year, month, day } = parseDateOnly(value);
  return `${de.weekdays[weekdayOf(value)]}, ${day}. ${de.months[month - 1]} ${year}`;
}

/** "Heute" / "Morgen" / "Mi., 14.10." relative to the given Berlin date. */
export function formatDateRelative(value: string, today: string): string {
  if (value === today) return de.relative.today;
  if (value === addDays(today, 1)) return de.relative.tomorrow;
  return formatDateShort(value);
}

// ---------- TimeOnly "HH:mm" ----------

/** Normalises "7:00", "07:00:00" → "07:00" (24 h). */
export function formatTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

/** "07:00", "07:15" → "07:00–07:15" */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

// ---------- DateTimeOffset → Europe/Berlin ----------

/** Last Sunday of a month (UTC date number). */
function lastSundayUtc(year: number, monthIndex: number): number {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

/**
 * Offset of Europe/Berlin from UTC in minutes for an instant: +120 during CEST (last Sunday of March 01:00 UTC until
 * last Sunday of October 01:00 UTC), +60 otherwise.
 */
export function berlinOffsetMinutes(instant: Date): number {
  const year = instant.getUTCFullYear();
  const dstStart = Date.UTC(year, 2, lastSundayUtc(year, 2), 1, 0, 0);
  const dstEnd = Date.UTC(year, 9, lastSundayUtc(year, 9), 1, 0, 0);
  const t = instant.getTime();
  return t >= dstStart && t < dstEnd ? 120 : 60;
}

export interface BerlinParts extends DateParts {
  hour: number;
  minute: number;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
}

export function toBerlin(instant: Date | string): BerlinParts {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const shifted = new Date(d.getTime() + berlinOffsetMinutes(d) * 60_000);
  const parts = {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
  return {
    ...parts,
    date: toDateOnly(parts),
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}

/** Today's calendar date in Berlin ("yyyy-MM-dd"). */
export function berlinToday(now: Date = new Date()): string {
  return toBerlin(now).date;
}

/** Converts a Berlin wall-clock date + time to a UTC instant (used to schedule local reminders). */
export function berlinWallClockToDate(date: string, time: string): Date {
  const { year, month, day } = parseDateOnly(date);
  const [h, m] = formatTime(time).split(':').map(Number) as [number, number];
  // First guess with standard time, then correct if DST applies at that instant.
  const guess = Date.UTC(year, month - 1, day, h, m) - 60 * 60_000;
  const offset = berlinOffsetMinutes(new Date(guess));
  return new Date(Date.UTC(year, month - 1, day, h, m) - offset * 60_000);
}

/** "2026-10-13T16:00:00+00:00" → "13.10.2026, 18:00 Uhr" */
export function formatDateTime(instant: Date | string): string {
  const b = toBerlin(instant);
  return `${formatDate(b.date)}, ${b.time} ${de.common.clock}`;
}

/** "Di., 13.10., 18:00 Uhr" */
export function formatDateTimeShort(instant: Date | string): string {
  const b = toBerlin(instant);
  return `${formatDateShort(b.date)}, ${b.time} ${de.common.clock}`;
}
