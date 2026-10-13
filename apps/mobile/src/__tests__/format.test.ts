import {
  addDays,
  berlinOffsetMinutes,
  berlinToday,
  berlinWallClockToDate,
  formatCents,
  formatDate,
  formatDateLong,
  formatDateRelative,
  formatDateShort,
  formatDateTime,
  formatMoney,
  formatTime,
  formatTimeRange,
  toBerlin,
  toCents,
  weekdayOf,
} from '@/utils/format';

const NBSP = ' ';

describe('money (integer cents, de-DE)', () => {
  it('converts API decimals to cents without float drift', () => {
    expect(toCents(1.9)).toBe(190);
    expect(toCents(2.2)).toBe(220);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
  });

  it('formats euros with comma decimals, dot grouping and a non-breaking space', () => {
    expect(formatCents(190)).toBe(`1,90${NBSP}€`);
    expect(formatCents(5)).toBe(`0,05${NBSP}€`);
    expect(formatCents(123456789)).toBe(`1.234.567,89${NBSP}€`);
    expect(formatCents(-250)).toBe(`-2,50${NBSP}€`);
    expect(formatMoney(12.5)).toBe(`12,50${NBSP}€`);
    expect(formatCents(100, 'CHF')).toBe(`1,00${NBSP}CHF`);
  });
});

describe('dates (DateOnly)', () => {
  it('computes weekdays independent of the device time zone', () => {
    expect(weekdayOf('2026-10-14')).toBe(3); // Wednesday
    expect(weekdayOf('2026-10-18')).toBe(0); // Sunday
  });

  it('formats German dates', () => {
    expect(formatDate('2026-10-14')).toBe('14.10.2026');
    expect(formatDateShort('2026-10-14')).toBe('Mi., 14.10.');
    expect(formatDateLong('2026-03-01')).toBe('Sonntag, 1. März 2026');
  });

  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('labels today and tomorrow relatively', () => {
    expect(formatDateRelative('2026-10-13', '2026-10-13')).toBe('Heute');
    expect(formatDateRelative('2026-10-14', '2026-10-13')).toBe('Morgen');
    expect(formatDateRelative('2026-10-16', '2026-10-13')).toBe('Fr., 16.10.');
  });
});

describe('times (24 h)', () => {
  it('normalises TimeOnly values', () => {
    expect(formatTime('7:05')).toBe('07:05');
    expect(formatTime('17:30:00')).toBe('17:30');
    expect(formatTimeRange('07:00', '07:15')).toBe('07:00–07:15');
  });
});

describe('Europe/Berlin conversion', () => {
  it('applies CEST/CET offsets including the DST switch', () => {
    expect(berlinOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(120);
    expect(berlinOffsetMinutes(new Date('2026-12-01T12:00:00Z'))).toBe(60);
    // DST ends 2026-10-25 01:00 UTC
    expect(toBerlin('2026-10-25T00:30:00Z').time).toBe('02:30');
    expect(toBerlin('2026-10-25T01:30:00Z').time).toBe('02:30');
    // DST starts 2026-03-29 01:00 UTC
    expect(toBerlin('2026-03-29T00:59:00Z').time).toBe('01:59');
    expect(toBerlin('2026-03-29T01:00:00Z').time).toBe('03:00');
  });

  it('formats server DateTimeOffsets in Berlin time', () => {
    expect(formatDateTime('2026-10-13T16:00:00+00:00')).toBe('13.10.2026, 18:00 Uhr');
    expect(formatDateTime('2026-11-02T17:00:00+00:00')).toBe('02.11.2026, 18:00 Uhr');
    expect(berlinToday(new Date('2026-10-12T22:30:00Z'))).toBe('2026-10-13');
  });

  it('converts Berlin wall-clock pickup times to instants', () => {
    expect(berlinWallClockToDate('2026-10-14', '09:00').toISOString()).toBe('2026-10-14T07:00:00.000Z');
    expect(berlinWallClockToDate('2026-12-01', '09:00').toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });
});
