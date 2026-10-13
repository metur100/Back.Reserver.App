import { fireEvent, render, screen } from '@testing-library/react-native';
import type { OrderHistoryDto, PublicProductDto } from '@/api/types';
import { AvailabilityBadge, OrderStatusBadge } from '@/components/Badges';
import { ProductRow } from '@/components/ProductRow';
import { QuantityStepper } from '@/components/QuantityStepper';
import { OrderHistory } from '@/components/staff/OrderHistory';

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: (props: object) => <View testID="expo-image" {...props} /> };
});

const product: PublicProductDto = {
  id: 'p1',
  name: 'Classic Donut',
  slug: 'classic-donut',
  description: 'Fluffiger Hefeteig mit Zuckerglasur.',
  categoryId: null,
  price: 1.9,
  currency: 'EUR',
  imageUrl: '/media/demo/classic-donut.svg',
  allergens: 'Weizen (Gluten), Ei, Milch',
  ingredients: null,
  dietaryLabels: ['vegetarisch'],
  leadTimeHours: 0,
  remaining: 3,
  availability: 'Low',
};

describe('QuantityStepper', () => {
  it('shows "Hinzufügen" at 0 and increments', async () => {
    const onChange = jest.fn();
    await render(<QuantityStepper name="Classic Donut" value={0} max={3} onChange={onChange} testID="s" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Ein Stück mehr von Classic Donut' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('disables increase at the maximum and decrements', async () => {
    const onChange = jest.fn();
    await render(<QuantityStepper name="Classic Donut" value={3} max={3} onChange={onChange} testID="s" />);
    expect(screen.getByTestId('s-value')).toHaveTextContent('3');
    const increase = screen.getByTestId('s-increase');
    expect(increase).toBeDisabled();
    await fireEvent.press(increase);
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('s-decrease'));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe('ProductRow', () => {
  it('renders price, low-stock availability, allergens and updates the quantity', async () => {
    const onChange = jest.fn();
    await render(<ProductRow product={product} quantity={1} onChangeQuantity={onChange} />);
    expect(screen.getByText('Classic Donut')).toBeOnTheScreen();
    expect(screen.getByText('1,90 €')).toBeOnTheScreen();
    expect(screen.getByText('Nur noch 3')).toBeOnTheScreen();
    expect(screen.getByText(/Weizen \(Gluten\), Ei, Milch/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('stepper-classic-donut-increase'));
    expect(onChange).toHaveBeenCalledWith(product, 2);
  });

  it('disables adding sold-out products', async () => {
    await render(<ProductRow product={{ ...product, remaining: 0, availability: 'SoldOut' }} quantity={0} onChangeQuantity={jest.fn()} />);
    expect(screen.getByText('Ausverkauft')).toBeOnTheScreen();
    expect(screen.getByTestId('stepper-classic-donut-add')).toBeDisabled();
  });
});

describe('badges', () => {
  it('shows order status as text (not colour only) for customers and staff', async () => {
    await render(<OrderStatusBadge status="ReadyForPickup" />);
    expect(screen.getByText('Abholbereit')).toBeOnTheScreen();
    await render(<OrderStatusBadge status="Confirmed" audience="staff" />);
    expect(screen.getByText('Neu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Neu')).toBeOnTheScreen();
  });

  it('shows availability labels', async () => {
    await render(<AvailabilityBadge availability="Available" remaining={20} />);
    expect(screen.getByText('Verfügbar')).toBeOnTheScreen();
  });
});

describe('OrderHistory', () => {
  it('renders entries without status change as notes', async () => {
    const history: OrderHistoryDto[] = [
      { fromStatus: null, toStatus: 'Confirmed', actor: 'Customer', changedByName: null, note: null, createdAt: '2026-10-13T06:00:00Z' },
      { fromStatus: 'Confirmed', toStatus: 'ReadyForPickup', actor: 'Staff', changedByName: 'Mia Hoffmann', note: null, createdAt: '2026-10-13T07:00:00Z' },
      {
        fromStatus: 'ReadyForPickup',
        toStatus: 'ReadyForPickup',
        actor: 'Staff',
        changedByName: 'Mia Hoffmann',
        note: 'Abholproblem: Croissant fehlt',
        createdAt: '2026-10-13T08:00:00Z',
      },
    ];
    await render(<OrderHistory history={history} />);
    expect(screen.getAllByTestId('history-note')).toHaveLength(1);
    expect(screen.getByText('Notiz')).toBeOnTheScreen();
    expect(screen.getByText('Abholproblem: Croissant fehlt')).toBeOnTheScreen();
    expect(screen.getByText('Neu → Bereit')).toBeOnTheScreen();
  });
});
