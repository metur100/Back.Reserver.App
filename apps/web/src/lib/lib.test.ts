import { describe, expect, it, vi } from 'vitest';
import { nbsp } from '@/test/utils';
import { downloadResponse, fileNameFromContentDisposition } from './download';
import { addDays, formatDateLong, formatDateNumeric, formatTime, formatTimeRange } from './format';
import { buildIcs } from './ics';
import { centsToGermanInput, formatCents, formatMoney, parseGermanPriceToCents, toCents } from './money';
import { actionsForStatus, orderStatusLabel, orderStatusTone, primaryAction } from './orderStatus';
import { extractPickupCode, formatPickupCodeInput, isPlausiblePickupCode, normalizePickupCode } from './pickupCode';

describe('pickup code normalisation', () => {
  it.each([
    ['BR-7K4M9X', 'BR-7K4M9X'],
    ['7k4m9x', 'BR-7K4M9X'],
    ['br 7k4m9x', 'BR-7K4M9X'],
    ['BR7K4M9X', 'BR-7K4M9X'],
    ['  br-7k4m9x  ', 'BR-7K4M9X'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePickupCode(input)).toBe(expected);
    expect(isPlausiblePickupCode(normalizePickupCode(input))).toBe(true);
  });

  it('formats input while typing and extracts codes from scanned text', () => {
    expect(formatPickupCodeInput('br-7k4m9x!')).toBe('BR-7K4M9X');
    expect(extractPickupCode('BR-7K4M9X')).toBe('BR-7K4M9X');
    expect(extractPickupCode('https://example.test/x BR 7K4M9X')).toBe('BR-7K4M9X');
    expect(extractPickupCode('hallo welt')).toBeNull();
  });
});

describe('order status labels', () => {
  it('uses the German labels', () => {
    expect(orderStatusLabel('Confirmed')).toBe('Bestätigt');
    expect(orderStatusLabel('Preparing')).toBe('In Vorbereitung');
    expect(orderStatusLabel('ReadyForPickup')).toBe('Abholbereit');
    expect(orderStatusLabel('Collected')).toBe('Abgeholt');
    expect(orderStatusLabel('Cancelled')).toBe('Storniert');
    expect(orderStatusLabel('NoShow')).toBe('Nicht abgeholt');
  });

  it('derives tones and the one-tap primary action', () => {
    expect(orderStatusTone('ReadyForPickup')).toBe('success');
    expect(primaryAction('Confirmed')).toBe('prepare');
    expect(primaryAction('Preparing')).toBe('ready');
    expect(primaryAction('ReadyForPickup')).toBe('collect');
    expect(primaryAction('Collected')).toBeNull();
    expect(primaryAction('Confirmed', ['collect'])).toBe('collect');
    expect(actionsForStatus('Cancelled')).toEqual([]);
  });
});

describe('currency and date formatting', () => {
  it('formats euros the German way and computes cents exactly', () => {
    expect(nbsp(formatMoney(2.5))).toBe('2,50 €');
    expect(nbsp(formatCents(123456))).toBe('1.234,56 €');
    expect(toCents(1.1 * 3)).toBe(330);
    expect(toCents(2.2)).toBe(220);
  });

  it('parses German price input', () => {
    expect(parseGermanPriceToCents('2,50')).toBe(250);
    expect(parseGermanPriceToCents('2.50')).toBe(250);
    expect(parseGermanPriceToCents('3')).toBe(300);
    expect(parseGermanPriceToCents('1.234,5')).toBe(123450);
    expect(parseGermanPriceToCents('2,555')).toBeNull();
    expect(parseGermanPriceToCents('abc')).toBeNull();
    expect(centsToGermanInput(250)).toBe('2,50');
  });

  it('formats dates and 24h times in de-DE', () => {
    expect(formatDateLong('2026-10-14')).toBe('Mittwoch, 14. Oktober');
    expect(formatDateNumeric('2026-10-14')).toBe('14.10.2026');
    expect(formatTime('07:30')).toBe('07:30 Uhr');
    expect(formatTimeRange('07:30', '08:00')).toBe('07:30–08:00 Uhr');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // DST change
  });
});

describe('CSV/blob download helper', () => {
  it('reads file names from Content-Disposition', () => {
    expect(fileNameFromContentDisposition('attachment; filename=orders.csv', 'x.csv')).toBe('orders.csv');
    expect(fileNameFromContentDisposition('attachment; filename="bestellungen 2026.csv"', 'x.csv')).toBe('bestellungen 2026.csv');
    expect(fileNameFromContentDisposition("attachment; filename=a.csv; filename*=UTF-8''B%C3%A4ckerei.csv", 'x.csv')).toBe('Bäckerei.csv');
    expect(fileNameFromContentDisposition(null, 'fallback.csv')).toBe('fallback.csv');
  });

  it('downloads a response as blob via an object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const res = new Response('a;b\n1;2', { headers: { 'Content-Disposition': 'attachment; filename=orders.csv', 'Content-Type': 'text/csv' } });
    const name = await downloadResponse(res, 'fallback.csv');
    expect(name).toBe('orders.csv');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('calendar export', () => {
  it('builds an RFC 5545 event without personal data', () => {
    const ics = buildIcs({
      uid: 'BR-7K4M9X',
      title: 'Abholung bei Bäckerei; Test',
      description: 'Code BR-7K4M9X',
      location: 'Am Rheinufer 7, Düsseldorf',
      date: '2026-10-14',
      start: '07:30',
      end: '08:00',
      now: new Date(Date.UTC(2026, 9, 12, 10, 0, 0)),
    });
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261014T073000');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20261014T080000');
    expect(ics).toContain('SUMMARY:Abholung bei Bäckerei\\; Test');
    expect(ics).toContain('LOCATION:Am Rheinufer 7\\, Düsseldorf');
  });
});
