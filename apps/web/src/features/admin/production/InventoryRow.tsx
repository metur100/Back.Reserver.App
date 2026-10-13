import { AlertTriangle } from 'lucide-react';
import type { DailyInventoryRowDto } from '@/api/types';
import { Switch } from '@/components/ui/controls';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/surface';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export interface InventoryDraft {
  planned: string;
  buffer: string;
  unavailable: boolean;
}

export function draftFromRow(row: DailyInventoryRowDto): InventoryDraft {
  return { planned: String(row.plannedQuantity), buffer: String(row.safetyBuffer), unavailable: row.isUnavailable };
}

/** Client-side mirror of UpdateDailyInventoryRequestValidator for one row. */
export function validateDraft(d: InventoryDraft): string | null {
  const isInt = (s: string) => /^\d+$/.test(s.trim());
  if (!isInt(d.planned) || Number(d.planned) > 100_000) return t('validation.plannedQuantity');
  if (!isInt(d.buffer)) return t('validation.bufferNegative');
  if (Number(d.buffer) > Number(d.planned)) return t('validation.bufferTooLarge');
  return null;
}

interface InventoryRowProps {
  row: DailyInventoryRowDto;
  draft: InventoryDraft;
  onChange: (draft: InventoryDraft) => void;
  readOnly: boolean;
  /** Server violation (409 quantity_below_reservations): units already committed. */
  violationCommitted?: number;
  dirty?: boolean;
}

/** One product in the daily inventory grid: planned qty, safety buffer, unavailable switch and live counters. */
export function InventoryRow({ row, draft, onChange, readOnly, violationCommitted, dirty }: InventoryRowProps) {
  const validation = validateDraft(draft);
  const error = violationCommitted !== undefined ? t('admin.production.violation', { committed: violationCommitted }) : validation;
  const errorId = `inv-${row.productId}-error`;
  return (
    <li
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-2 p-3 md:grid-cols-[minmax(0,2.2fr)_6.5rem_6.5rem_5rem_5rem_5rem_6rem] md:items-center md:gap-y-0 md:px-4',
        row.isLowStock && !draft.unavailable && 'bg-warning-soft/45',
        error && 'bg-danger-soft/40',
      )}
      data-testid="inventory-row"
      data-product={row.productName}
    >
      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className="truncate font-medium">
          {row.productName}
          {dirty && <span className="ml-1.5 text-primary" aria-label={t('admin.production.unsaved')}>•</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {row.categoryName && <span className="text-xs text-muted-foreground">{row.categoryName}</span>}
          {!row.isPublished && <Badge tone="neutral">{t('admin.production.draft')}</Badge>}
          {row.isLowStock && !draft.unavailable && (
            <Badge tone="warning">
              <AlertTriangle aria-hidden="true" />
              {t('admin.production.low')}
            </Badge>
          )}
        </div>
      </div>
      <label className="flex flex-col gap-1 md:block">
        <span className="text-xs text-muted-foreground md:sr-only">{t('admin.production.planned')}</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.planned}
          disabled={readOnly}
          onChange={(e) => onChange({ ...draft, planned: e.target.value })}
          aria-label={`${t('admin.production.planned')}: ${row.productName}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 tabular"
        />
      </label>
      <label className="flex flex-col gap-1 md:block">
        <span className="text-xs text-muted-foreground md:sr-only">{t('admin.production.buffer')}</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.buffer}
          disabled={readOnly}
          onChange={(e) => onChange({ ...draft, buffer: e.target.value })}
          aria-label={`${t('admin.production.buffer')}: ${row.productName}`}
          className="h-11 tabular"
        />
      </label>
      <Stat label={t('admin.production.reserved')} value={row.reservedQuantity} />
      <Stat label={t('admin.production.collected')} value={row.collectedQuantity} />
      <Stat label={t('admin.production.remaining')} value={row.remaining} strong tone={row.remaining === 0 && row.maxSellable > 0 ? 'danger' : undefined} />
      <div className="flex items-center gap-2 md:justify-center">
        <Switch
          checked={draft.unavailable}
          disabled={readOnly}
          onCheckedChange={(v) => onChange({ ...draft, unavailable: v })}
          aria-label={t('admin.production.unavailableLabel', { name: row.productName })}
        />
        <span className="text-xs text-muted-foreground md:sr-only">{t('admin.production.unavailable')}</span>
      </div>
      {error && (
        <p id={errorId} className="col-span-2 text-sm font-medium text-danger md:col-span-7 md:pt-2" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function Stat({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: 'danger' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <span className="text-xs text-muted-foreground md:sr-only">{label}</span>
      <span className={cn('tabular', strong && 'font-semibold', tone === 'danger' && 'text-danger')}>{value}</span>
    </div>
  );
}
