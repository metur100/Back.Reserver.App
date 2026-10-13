import type { PublicAvailableDateDto } from '@/api/types';
import { t } from '@/i18n';
import { formatDayMonth, formatWeekdayShort, relativeDay } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DateChipsProps {
  dates: PublicAvailableDateDto[];
  selected: string | undefined;
  onSelect: (date: string) => void;
  today: string;
}

/** Horizontally scrollable pickup day chips. Non-orderable days are disabled and state the reason in text. */
export function DateChips({ dates, selected, onSelect, today }: DateChipsProps) {
  return (
    <div role="group" aria-label={t('bakery.chooseDate')} className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
      {dates.map((d) => {
        const rel = relativeDay(d.date, today);
        const isSelected = d.date === selected;
        const reason = d.isOrderable ? null : t(`dateStatus.${d.status}` as 'dateStatus.closed');
        return (
          <button
            key={d.date}
            type="button"
            disabled={!d.isOrderable}
            aria-pressed={isSelected}
            onClick={() => onSelect(d.date)}
            data-date={d.date}
            className={cn(
              'flex min-h-[4.25rem] min-w-[5.25rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg border px-3 py-2 text-center transition-colors',
              isSelected
                ? 'border-foreground bg-foreground text-background shadow-raised'
                : d.isOrderable
                  ? 'border-border-strong bg-surface hover:border-foreground'
                  : 'cursor-not-allowed border-dashed border-border bg-surface-muted/60 text-subtle-foreground',
            )}
          >
            <span className="text-xs font-semibold tracking-wide uppercase">
              {rel === 'today' ? t('bakery.today') : rel === 'tomorrow' ? t('bakery.tomorrow') : formatWeekdayShort(d.date)}
            </span>
            <span className="text-[0.95rem] font-semibold tabular">{formatDayMonth(d.date)}</span>
            {reason && <span className="mt-0.5 text-[0.7rem] leading-tight">{reason}</span>}
          </button>
        );
      })}
    </div>
  );
}
