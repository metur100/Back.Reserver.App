import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '@/api/endpoints';
import type { ReportExportType } from '@/api/types';
import { CardsSkeleton, EmptyState, ErrorState, PageHeader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Input, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { downloadResponse } from '@/lib/download';
import { addDays, formatDateShort, formatNumber, startOfMonthIso, todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import { useAdmin } from '../AdminContext';
import { OrdersByDayChart } from './OrdersByDayChart';

type Preset = 'last7' | 'last30' | 'thisMonth' | 'custom';

function rangeFor(preset: Exclude<Preset, 'custom'>) {
  const today = todayIso();
  if (preset === 'last7') return { from: addDays(today, -6), to: today };
  if (preset === 'last30') return { from: addDays(today, -29), to: today };
  return { from: startOfMonthIso(today), to: today };
}

export default function ReportsPage() {
  useDocumentTitle(t('admin.reports.title'));
  const { key, selectedLocationId } = useAdmin();
  const [preset, setPreset] = useState<Preset>('last7');
  const [range, setRange] = useState(() => rangeFor('last7'));
  const query = { locationId: selectedLocationId || undefined, from: range.from, to: range.to };
  const summaryQ = useQuery({ queryKey: key('reports', query), queryFn: () => adminApi.reportSummary(query) });

  const exportCsv = useMutation({
    mutationFn: async (type: ReportExportType) => {
      const res = await adminApi.reportExport(type, query);
      return downloadResponse(res, `${type}-${range.from}-${range.to}.csv`);
    },
    onSuccess: () => toast.success(t('admin.reports.exported')),
    onError: (e) => toast.fromError(e),
  });

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(rangeFor(p));
  };

  const s = summaryQ.data;

  return (
    <div>
      <PageHeader
        title={t('admin.reports.title')}
        actions={
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('admin.reports.export')}>
            {(['orders', 'products', 'slots'] as ReportExportType[]).map((type) => (
              <Button key={type} variant="outline" size="sm" loading={exportCsv.isPending && exportCsv.variables === type} onClick={() => exportCsv.mutate(type)}>
                <Download aria-hidden="true" />
                {t(type === 'orders' ? 'admin.reports.exportOrders' : type === 'products' ? 'admin.reports.exportProducts' : 'admin.reports.exportSlots')}
              </Button>
            ))}
          </div>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t('admin.reports.range')}</span>
          <div className="flex flex-wrap gap-2">
            {(['last7', 'last30', 'thisMonth', 'custom'] as Preset[]).map((p) => (
              <Button key={p} variant={preset === p ? 'primary' : 'outline'} aria-pressed={preset === p} onClick={() => choose(p)}>
                {t(`admin.reports.${p}`)}
              </Button>
            ))}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            <div className="space-y-1.5">
              <Label htmlFor="report-from">{t('admin.orders.from')}</Label>
              <Input id="report-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to">{t('admin.orders.to')}</Label>
              <Input id="report-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </div>
        )}
      </Card>

      {summaryQ.isPending ? (
        <CardsSkeleton count={6} />
      ) : summaryQ.isError ? (
        <ErrorState error={summaryQ.error} onRetry={() => void summaryQ.refetch()} />
      ) : (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label={t('admin.reports.title')}>
            {[
              { label: t('admin.reports.orders'), value: formatNumber(s!.orders) },
              { label: t('admin.reports.items'), value: formatNumber(s!.items) },
              { label: t('admin.reports.value'), value: formatMoney(s!.reservedValue, s!.currency), hint: t('admin.reports.valueHint') },
              { label: t('admin.reports.collected'), value: formatNumber(s!.collected) },
              { label: t('admin.reports.cancelled'), value: formatNumber(s!.cancelled) },
              { label: t('admin.reports.noShow'), value: formatNumber(s!.noShow) },
            ].map((k) => (
              <Card key={k.label} className="p-4">
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold tabular">{k.value}</p>
                {k.hint && <p className="text-xs text-muted-foreground">{k.hint}</p>}
              </Card>
            ))}
          </section>

          {s!.orders === 0 ? (
            <EmptyState title={t('admin.reports.empty')} />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.reports.byDay')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="chart">
                    <TabsList>
                      <TabsTrigger value="chart">{t('admin.reports.showChart')}</TabsTrigger>
                      <TabsTrigger value="table">{t('admin.reports.showTable')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="chart">
                      <OrdersByDayChart data={s!.byDay} currency={s!.currency} />
                    </TabsContent>
                    <TabsContent value="table">
                      <DataTable
                        caption={t('admin.reports.byDay')}
                        headers={[t('admin.reports.date'), t('admin.reports.orders'), t('admin.reports.items'), t('admin.reports.value'), t('admin.reports.collected'), t('admin.reports.cancelled'), t('admin.reports.noShow')]}
                        rows={s!.byDay.map((d) => [formatDateShort(d.date), d.orders, d.items, formatMoney(d.reservedValue, s!.currency), d.collected, d.cancelled, d.noShow])}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.reports.byProduct')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      caption={t('admin.reports.byProduct')}
                      headers={[t('admin.reports.product'), t('admin.reports.quantity'), t('admin.reports.orders'), t('admin.reports.value')]}
                      rows={s!.byProduct.map((p) => [p.productName, p.quantity, p.orders, formatMoney(p.reservedValue, s!.currency)])}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.reports.bySlot')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      caption={t('admin.reports.bySlot')}
                      headers={[t('admin.reports.slot'), t('admin.reports.orders'), t('admin.reports.items')]}
                      rows={s!.bySlot.map((sl) => [`${sl.slotStart} Uhr`, sl.orders, sl.items])}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[0.95rem]">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-sm text-muted-foreground">
          <tr>
            {headers.map((h, i) => (
              <th key={h} scope="col" className={cn('px-2 py-2 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-2 py-2 font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="px-2 py-2 text-right tabular">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
