import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { product } from '@/test/utils';
import { ProductCard } from './ProductCard';

describe('QuantityStepper', () => {
  it('respects min and max (remaining stock)', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={2} max={3} onChange={onChange} label="Donut" />);
    await userEvent.click(screen.getByRole('button', { name: 'Menge von Donut erhöhen' }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    rerender(<QuantityStepper value={3} max={3} onChange={onChange} label="Donut" />);
    expect(screen.getByRole('button', { name: 'Menge von Donut erhöhen' })).toBeDisabled();

    rerender(<QuantityStepper value={0} max={3} onChange={onChange} label="Donut" />);
    expect(screen.getByRole('button', { name: 'Menge von Donut verringern' })).toBeDisabled();
  });
});

describe('ProductCard', () => {
  const props = { onAdd: vi.fn(), onChangeQuantity: vi.fn(), allergenDisclaimer: 'Spuren möglich.' };

  it('shows price, availability with text and adds to the basket', async () => {
    const onAdd = vi.fn();
    render(<ProductCard {...props} onAdd={onAdd} product={product({ price: 1.9 })} quantity={0} />);
    expect(screen.getByText(/1,90/)).toBeInTheDocument();
    expect(screen.getAllByText('Verfügbar').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Classic Donut in den Warenkorb legen' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('shows "Nur noch" for low stock and limits the stepper to the remaining quantity', async () => {
    const onChange = vi.fn();
    render(<ProductCard {...props} onChangeQuantity={onChange} product={product({ remaining: 3, availability: 'Low' })} quantity={3} />);
    expect(screen.getAllByText('Nur noch 3').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Menge von Classic Donut erhöhen' })).toBeDisabled();
    expect(screen.getByText('Maximal 3 verfügbar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Menge von Classic Donut verringern' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('disables ordering when sold out', () => {
    render(<ProductCard {...props} product={product({ remaining: 0, availability: 'SoldOut' })} quantity={0} />);
    const button = screen.getByRole('button', { name: /Classic Donut: Ausverkauft/ });
    expect(button).toBeDisabled();
  });

  it('shows allergens exactly as supplied and the bakery disclaimer', async () => {
    render(<ProductCard {...props} product={product({ allergens: 'Weizen (Gluten), Milch' })} quantity={0} />);
    await userEvent.click(screen.getByRole('button', { name: /Allergene/ }));
    expect(screen.getByText('Weizen (Gluten), Milch')).toBeInTheDocument();
    expect(screen.getByText('Spuren möglich.')).toBeInTheDocument();
  });
});
