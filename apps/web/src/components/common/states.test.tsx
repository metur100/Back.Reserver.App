import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { OrderStatusBadge } from './status';
import { EmptyState, ErrorState } from './states';

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(<EmptyState title="Keine Bestellungen" description="Bitte Filter anpassen." action={<button>Neu</button>} />);
    expect(screen.getByText('Keine Bestellungen')).toBeInTheDocument();
    expect(screen.getByText('Bitte Filter anpassen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neu' })).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('shows the server title and retries', async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(500, { title: 'Serverfehler.', code: 'internal_error' })} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Serverfehler.');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('explains network errors', () => {
    render(<ErrorState error={new ApiError(0, { title: 'Keine Verbindung zum Server.', code: 'network_error' })} onRetry={() => undefined} />);
    expect(screen.getByText('Keine Verbindung zum Server.')).toBeInTheDocument();
  });

  it('shows permission denied without a retry button', () => {
    render(<ErrorState error={new ApiError(403, { title: 'Keine Berechtigung für diese Aktion.', code: 'forbidden' })} onRetry={() => undefined} />);
    expect(screen.getByText('Kein Zugriff')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an upgrade hint for plan features', () => {
    render(<ErrorState error={new ApiError(403, { title: 'Diese Funktion ist in Ihrem Tarif „Starter“ nicht enthalten.', code: 'plan_feature_unavailable' })} />);
    expect(screen.getByText(/Abonnement/)).toBeInTheDocument();
  });
});

describe('OrderStatusBadge', () => {
  it('uses icon + text, never colour alone', () => {
    render(<OrderStatusBadge status="ReadyForPickup" />);
    const badge = screen.getByText('Abholbereit');
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});
