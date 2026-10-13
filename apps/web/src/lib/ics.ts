import type { IsoDate, IsoTime } from '@/api/types';

const pad = (n: number) => String(n).padStart(2, '0');

function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function localStamp(date: IsoDate, time: IsoTime) {
  return `${date.replace(/-/g, '')}T${time.replace(':', '').slice(0, 4)}00`;
}

export interface CalendarEventInput {
  uid: string;
  title: string;
  description: string;
  location: string;
  date: IsoDate;
  start: IsoTime;
  end: IsoTime;
  timeZone?: string;
  now?: Date;
}

/** Builds a minimal RFC 5545 calendar file for the pickup appointment (generated entirely client side). */
export function buildIcs(e: CalendarEventInput): string {
  const now = e.now ?? new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(
    now.getUTCMinutes(),
  )}${pad(now.getUTCSeconds())}Z`;
  const tz = e.timeZone ?? 'Europe/Berlin';
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BackReserve//Abholung//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${e.uid}@backreserve`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${tz}:${localStamp(e.date, e.start)}`,
      `DTEND;TZID=${tz}:${localStamp(e.date, e.end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      `LOCATION:${escapeText(e.location)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n'
  );
}
