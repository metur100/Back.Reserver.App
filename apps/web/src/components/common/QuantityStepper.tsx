import { Minus, Plus } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  /** Product name for accessible labels. */
  label: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

/** Touch-friendly quantity control (≥ 44px targets) that never exceeds max (= remaining stock). */
export function QuantityStepper({ value, onChange, min = 0, max, label, disabled, size = 'md', className }: QuantityStepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const btn = cn(
    'inline-flex items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-muted active:bg-surface-sunken disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-3 focus-visible:outline-ring',
    size === 'lg' ? 'size-12' : 'size-11',
  );
  return (
    <div
      role="group"
      aria-label={`${t('bakery.quantity')}: ${label}`}
      className={cn('inline-flex items-center rounded-lg border border-border-strong bg-surface', className)}
    >
      <button type="button" className={btn} onClick={() => onChange(clamp(value - 1))} disabled={disabled || value <= min} aria-label={t('bakery.decrease', { name: label })}>
        <Minus className="size-5" aria-hidden="true" />
      </button>
      <span className={cn('tabular min-w-9 text-center text-lg font-semibold', disabled && 'text-muted-foreground')} aria-live="polite" aria-atomic="true">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(clamp(value + 1))} disabled={disabled || value >= max} aria-label={t('bakery.increase', { name: label })}>
        <Plus className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
