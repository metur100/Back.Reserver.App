import { useState } from 'react';
import type { OrdersByDayDto } from '@/api/types';
import { t } from '@/i18n';
import { formatDateShort, formatDayMonth } from '@/lib/format';
import { formatMoney } from '@/lib/money';

const HEIGHT = 220;
const PAD = { top: 16, right: 8, bottom: 28, left: 32 };

function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => value / s <= 4) ?? pow * 10;
  return Math.ceil(value / step) * step;
}

/** Single-series bar chart (reservations per day) in plain SVG: recessive grid, rounded data-ends, hover/focus tooltip. */
export function OrdersByDayChart({ data, currency }: { data: OrdersByDayDto[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const width = Math.max(320, data.length * 28 + PAD.left + PAD.right);
  const max = niceMax(Math.max(0, ...data.map((d) => d.orders)));
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = (width - PAD.left - PAD.right) / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(28, slot - 2));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 10);
  const activeDay = active !== null ? data[active] : undefined;

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width="100%"
          style={{ minWidth: Math.min(width, 640) }}
          className="block h-[220px]"
          role="img"
          aria-label={t('admin.reports.byDayChart')}
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((tick) => {
            const y = PAD.top + plotH - (tick / max) * plotH;
            return (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-muted-foreground)">
                  {tick}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.orders / max) * plotH;
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const y = PAD.top + plotH - h;
            const r = Math.min(4, barW / 2, h);
            return (
              <g
                key={d.date}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${formatDateShort(d.date)}: ${t('admin.reports.orders')} ${d.orders}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              >
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${PAD.top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${PAD.top + plotH} Z`}
                    fill="var(--color-primary)"
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--color-muted-foreground)">
                    {formatDayMonth(d.date)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--color-border-strong)" strokeWidth={1} />
        </svg>
      </div>
      {activeDay && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-raised" role="status">
          <p className="font-semibold">{formatDateShort(activeDay.date)}</p>
          <p>
            {t('admin.reports.orders')}: <span className="font-semibold tabular">{activeDay.orders}</span>
          </p>
          <p className="text-muted-foreground">
            {t('admin.reports.items')}: {activeDay.items} · {formatMoney(activeDay.reservedValue, currency)}
          </p>
        </div>
      )}
    </div>
  );
}
