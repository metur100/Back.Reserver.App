import { intlLocale } from '@/i18n';
import type { DayOfWeek, IsoDate, IsoDateTime, IsoTime } from '@/api/types';

/** Parses "yyyy-MM-dd" as a local calendar date at noon (immune to DST/time zone shifts). */
export function parseIsoDate(value: IsoDate): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(value);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function todayIso(now = new Date()): IsoDate {
  return toIsoDate(now);
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIsoDate(a).getTime() - parseIsoDate(b).getTime()) / 86_400_000);
}

export function startOfMonthIso(value: IsoDate): IsoDate {
  return `${value.slice(0, 7)}-01`;
}

/** "Mittwoch, 14. Oktober" */
export function formatDateLong(value: IsoDate, withYear = false): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(parseIsoDate(value));
}

/** "Mi., 14.10." */
export function formatDateShort(value: IsoDate): string {
  return new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }).format(parseIsoDate(value));
}

/** "14.10.2026" */
export function formatDateNumeric(value: IsoDate): string {
  return new Intl.DateTimeFormat(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseIsoDate(value));
}

/** "Mi" */
export function formatWeekdayShort(value: IsoDate): string {
  return new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' }).format(parseIsoDate(value)).replace('.', '');
}

/** "14. Okt." */
export function formatDayMonth(value: IsoDate): string {
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(parseIsoDate(value));
}

/** "07:30 Uhr" */
export function formatTime(value: IsoTime): string {
  return `${value.slice(0, 5)} Uhr`;
}

/** "07:30–08:00 Uhr" */
export function formatTimeRange(start: IsoTime, end: IsoTime): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)} Uhr`;
}

/** "13.10.2026, 18:00 Uhr" in the user's zone or an explicit IANA zone. */
export function formatDateTime(value: IsoDateTime, timeZone?: string): string {
  const d = new Date(value);
  const date = new Intl.DateTimeFormat(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(d);
  const time = new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(d);
  return `${date}, ${time} Uhr`;
}

/** "Dienstag, 13. Oktober, 18:00 Uhr" */
export function formatDateTimeLong(value: IsoDateTime, timeZone?: string): string {
  const d = new Date(value);
  const date = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(d);
  const time = new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(d);
  return `${date}, ${time} Uhr`;
}

/** "18:00" of a timestamp. */
export function formatClock(value: IsoDateTime, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(value));
}

export function relativeDay(value: IsoDate, today: IsoDate = todayIso()): 'today' | 'tomorrow' | null {
  const diff = diffDays(value, today);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : null;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(intlLocale()).format(value);
}

/** Adds minutes to "HH:mm"; returns "HH:mm". */
export function addMinutesToTime(time: IsoTime, minutes: number): IsoTime {
  const total = timeToMinutes(time) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function timeToMinutes(time: IsoTime): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const dayNames: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function dayOfWeekOf(value: IsoDate): DayOfWeek {
  return dayNames[parseIsoDate(value).getDay()]!;
}

export const WEEK_DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
