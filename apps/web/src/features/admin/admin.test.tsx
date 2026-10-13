import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DailyInventoryRowDto, OrderHistoryDto } from '@/api/types';
import { OrderHistory, isNoteEntry } from './orders/orderActions';
import { draftFromRow, InventoryRow, validateDraft } from './production/InventoryRow';
import { formToUpsert, productFormSchema, emptyProductForm } from './products/productSchema';
import { validateScheduleRow } from './locations/locationSchema';

const row: DailyInventoryRowDto = {
  inventoryId: 'inv-1',
  productId: 'p1',
  productName: 'Classic Donut',
  categoryName: 'Donuts',
  isPublished: true,
  plannedQuantity: 20,
  safetyBuffer: 2,
  reservedQuantity: 12,
  collectedQuantity: 0,
  noShowQuantity: 0,
  maxSellable: 18,
  remaining: 6,
  isUnavailable: false,
  isLowStock: false,
};

describe('InventoryRow', () => {
  it('shows live counters and edits the planned quantity', () => {
    const onChange = vi.fn();
    render(
      <ul>
        <InventoryRow row={row} draft={draftFromRow(row)} onChange={onChange} readOnly={false} />
      </ul>,
    );
    const item = screen.getByTestId('inventory-row');
    expect(within(item).getByText('12')).toBeInTheDocument();
    expect(within(item).getByText('6')).toBeInTheDocument();
    const planned = screen.getByLabelText('Geplant: Classic Donut');
    fireEvent.change(planned, { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith({ planned: '5', buffer: '2', unavailable: false });
  });

  it('shows the server violation inline (409 quantity_below_reservations)', () => {
    render(
      <ul>
        <InventoryRow row={row} draft={{ planned: '5', buffer: '0', unavailable: false }} onChange={() => undefined} readOnly={false} violationCommitted={12} />
      </ul>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bereits 12 reserviert – Menge kann nicht darunter gesenkt werden.');
    expect(screen.getByLabelText('Geplant: Classic Donut')).toHaveAttribute('aria-invalid', 'true');
  });

  it('validates buffer and planned quantity like the server', () => {
    expect(validateDraft({ planned: '10', buffer: '2', unavailable: false })).toBeNull();
    expect(validateDraft({ planned: '1', buffer: '2', unavailable: false })).toBe('Der Puffer darf nicht größer als die geplante Menge sein.');
    expect(validateDraft({ planned: '-1', buffer: '0', unavailable: false })).toBe('Die geplante Menge muss zwischen 0 und 100.000 liegen.');
  });

  it('disables inputs in read-only mode', () => {
    render(
      <ul>
        <InventoryRow row={row} draft={draftFromRow(row)} onChange={() => undefined} readOnly />
      </ul>,
    );
    expect(screen.getByLabelText('Geplant: Classic Donut')).toBeDisabled();
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});

describe('OrderHistory', () => {
  const history: OrderHistoryDto[] = [
    { fromStatus: null, toStatus: 'Confirmed', actor: 'Customer', changedByName: null, note: null, createdAt: '2026-10-13T08:00:00Z' },
    { fromStatus: 'Confirmed', toStatus: 'Preparing', actor: 'Staff', changedByName: 'Tom Team', note: null, createdAt: '2026-10-13T09:00:00Z' },
    { fromStatus: 'Preparing', toStatus: 'Preparing', actor: 'Staff', changedByName: 'Tom Team', note: 'Abholproblem: Croissant fehlte', createdAt: '2026-10-13T09:30:00Z' },
  ];

  it('renders status changes and problem notes (fromStatus === toStatus) differently', () => {
    render(<OrderHistory history={history} />);
    expect(screen.getByText('Reservierung eingegangen')).toBeInTheDocument();
    expect(screen.getByText('Bestätigt → In Vorbereitung')).toBeInTheDocument();
    expect(screen.getByText('Notiz')).toBeInTheDocument();
    expect(screen.getByText('Abholproblem: Croissant fehlte')).toBeInTheDocument();
    expect(screen.queryByText('In Vorbereitung → In Vorbereitung')).not.toBeInTheDocument();
    expect(isNoteEntry(history[2]!)).toBe(true);
    expect(isNoteEntry(history[0]!)).toBe(false);
  });
});

describe('product form schema', () => {
  it('accepts German decimal prices and converts to the request', () => {
    const values = { ...emptyProductForm, name: 'Brezel', price: '1,20', dietaryLabels: ['vegan'], defaultDailyQuantity: '40' };
    expect(productFormSchema.safeParse(values).success).toBe(true);
    expect(formToUpsert(values)).toMatchObject({ name: 'Brezel', basePrice: 1.2, dietaryLabels: ['vegan'], defaultDailyQuantity: 40, categoryId: null });
  });

  it('rejects invalid prices, URLs and too many labels with German messages', () => {
    const result = productFormSchema.safeParse({
      ...emptyProductForm,
      name: '',
      price: '1,234',
      imageUrl: 'http://unsicher.example/bild.png',
      dietaryLabels: Array.from({ length: 11 }, (_, i) => `l${i}`),
    });
    expect(result.success).toBe(false);
    const msgs = result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
    expect(msgs).toMatchObject({
      name: 'Bitte einen Produktnamen angeben.',
      price: 'Der Preis darf höchstens zwei Nachkommastellen haben.',
      imageUrl: 'Bitte eine gültige https-Adresse angeben.',
      dietaryLabels: 'Höchstens 10 Kennzeichnungen mit je 40 Zeichen.',
    });
  });
});

describe('schedule validation', () => {
  const day = {
    dayOfWeek: 'Monday' as const,
    isOpen: true,
    opensAt: '06:30',
    closesAt: '18:00',
    pickupStart: '07:00',
    pickupEnd: '17:00',
    slotMinutes: '30',
    maxOrdersPerSlot: '10',
    maxItemsPerSlot: '',
  };
  it('mirrors UpdateScheduleRequestValidator', () => {
    expect(validateScheduleRow(day)).toEqual({});
    expect(validateScheduleRow({ ...day, pickupEnd: '06:00' }).pickupEnd).toBe('Das Ende der Abholzeit muss nach dem Beginn liegen.');
    expect(validateScheduleRow({ ...day, pickupEnd: '07:20' }).pickupEnd).toBe('Das Abholfenster ist kürzer als ein Zeitfenster.');
    expect(validateScheduleRow({ ...day, slotMinutes: '2' }).slotMinutes).toBe('Die Zeitfensterlänge muss zwischen 5 und 240 Minuten liegen.');
    expect(validateScheduleRow({ ...day, isOpen: false, pickupEnd: '06:00' })).toEqual({});
  });
});
