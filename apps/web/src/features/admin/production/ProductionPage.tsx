import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { CopyPlus, ListRestart, Printer, Save, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { isApiError } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { DailyInventoryDto, ProductionOverviewDto, QuantityViolation } from '@/api/types';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/input';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { addDays, formatDateLong, formatTime, todayIso } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAdmin } from '../AdminContext';
import { draftFromRow, InventoryRow, validateDraft, type InventoryDraft } from './InventoryRow';

export default function ProductionPage() {
  useDocumentTitle(t('admin.production.title'));
  const { locations, effectiveLocationId, locationsLoading } = useAdmin();
  const [date, setDate] = useState(() => addDays(todayIso(), 1));
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const activeLocation = locationId && locations.some((l) => l.id === locationId) ? locationId : effectiveLocationId;
  const location = locations.find((l) => l.id === activeLocation);

  if (!locationsLoading && locations.length === 0) {
    return (
      <div>
        <PageHeader title={t('admin.production.title')} />
        <EmptyState
          title={t('admin.production.noLocation')}
          action={
            <Button asChild>
              <Link to="/admin/standorte">{t('admin.locations.new')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title={t('admin.production.title')}
          description={t('admin.production.lead')}
          actions={
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              {t('admin.production.print')}
            </Button>
          }
        />
        <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-48">
            <Label htmlFor="production-date">{t('admin.production.date')}</Label>
            <Input id="production-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDate(todayIso())}>
              {t('admin.orders.today')}
            </Button>
            <Button variant="outline" onClick={() => setDate(addDays(todayIso(), 1))}>
              {t('admin.orders.tomorrow')}
            </Button>
          </div>
          {locations.length > 1 && (
            <div className="space-y-1.5 sm:w-64">
              <Label htmlFor="production-location">{t('admin.production.location')}</Label>
              <NativeSelect id="production-location" value={activeLocation} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </Card>
      </div>
      <h1 className="mb-3 hidden font-display text-2xl font-semibold print:block">
        {t('admin.production.printTitle', { date: formatDateLong(date, true), location: location?.name ?? '' })}
      </h1>
      {activeLocation && <ProductionContent key={`${activeLocation}-${date}`} locationId={activeLocation} date={date} />}
    </div>
  );
}

function ProductionContent({ locationId, date }: { locationId: string; date: string }) {
  const { key, can } = useAdmin();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, InventoryDraft>>({});
  const [violations, setViolations] = useState<Record<string, number>>({});
  const [copyOpen, setCopyOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const past = date < todayIso();
  const readOnly = !can('InventoryManage') || past;

  const dailyKey = key('inventory', 'daily', locationId, date);
  const dailyQ = useQuery({ queryKey: dailyKey, queryFn: () => adminApi.dailyInventory(locationId, date), refetchInterval: 30_000 });
  const overviewQ = useQuery({
    queryKey: key('inventory', 'overview', locationId, date),
    queryFn: () => adminApi.production(locationId, date),
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => dailyQ.data?.rows ?? [], [dailyQ.data]);
  const dirtyIds = Object.keys(edits);
  const hasErrors = rows.some((r) => edits[r.productId] && validateDraft(edits[r.productId]!));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key('inventory') });
    void queryClient.invalidateQueries({ queryKey: key('dashboard') });
  };

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateDailyInventory({
        locationId,
        date,
        items: rows
          .filter((r) => edits[r.productId] || r.inventoryId)
          .map((r) => {
            const d = edits[r.productId] ?? draftFromRow(r);
            return { productId: r.productId, plannedQuantity: Number(d.planned), safetyBuffer: Number(d.buffer), isUnavailable: d.unavailable };
          }),
      }),
    onSuccess: (updated: DailyInventoryDto) => {
      queryClient.setQueryData(dailyKey, updated);
      setEdits({});
      setViolations({});
      refresh();
      toast.success(t('admin.production.saved'));
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'quantity_below_reservations') {
        const list = error.ext<QuantityViolation[]>('violations') ?? [];
        setViolations(Object.fromEntries(list.map((v) => [v.productId, v.committed])));
      }
      toast.fromError(error);
    },
  });

  const bulk = useMutation({
    mutationFn: (input: { kind: 'copy'; sourceDate: string; overwrite: boolean } | { kind: 'defaults'; overwrite: boolean }) =>
      input.kind === 'copy'
        ? adminApi.copyDay({ locationId, sourceDate: input.sourceDate, targetDate: date, overwrite: input.overwrite })
        : adminApi.applyDefaults({ locationId, date, overwrite: input.overwrite }),
    onSuccess: (result) => {
      setEdits({});
      setViolations({});
      setWarnings(result.warnings);
      refresh();
      toast.success(t('admin.production.result', { created: result.created, updated: result.updated, skipped: result.skipped }));
      setCopyOpen(false);
      setDefaultsOpen(false);
    },
    onError: (e) => toast.fromError(e),
  });

  return (
    <div className="space-y-6">
      <Card className="no-print">
        <CardHeader>
          <div>
            <CardTitle>{t('admin.production.availability')}</CardTitle>
            <p className="text-sm text-muted-foreground">{formatDateLong(date, true)}</p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setCopyOpen(true)}>
                <CopyPlus aria-hidden="true" />
                {t('admin.production.copyDay')}
              </Button>
              <Button variant="outline" onClick={() => setDefaultsOpen(true)}>
                <ListRestart aria-hidden="true" />
                {t('admin.production.applyDefaults')}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {past && <Alert tone="info">{t('admin.production.pastDate')}</Alert>}
          {!past && !can('InventoryManage') && <Alert tone="info">{t('admin.production.readOnly')}</Alert>}
          {warnings.length > 0 && (
            <Alert tone="warning">
              <ul className="list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
          {dailyQ.isPending ? (
            <ListSkeleton rows={4} />
          ) : dailyQ.isError ? (
            <ErrorState error={dailyQ.error} onRetry={() => void dailyQ.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('admin.production.empty')}
              description={t('admin.production.emptyHint')}
              action={
                can('ProductsManage') ? (
                  <Button asChild>
                    <Link to="/admin/produkte">{t('admin.products.new')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border">
                <div
                  className="hidden border-b border-border bg-surface-muted/60 px-4 py-2 text-sm font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,2.2fr)_6.5rem_6.5rem_5rem_5rem_5rem_6rem] md:gap-x-3"
                  aria-hidden="true"
                >
                  <span>{t('admin.production.product')}</span>
                  <span>{t('admin.production.planned')}</span>
                  <span>{t('admin.production.buffer')}</span>
                  <span className="text-right">{t('admin.production.reserved')}</span>
                  <span className="text-right">{t('admin.production.collected')}</span>
                  <span className="text-right">{t('admin.production.remaining')}</span>
                  <span className="text-center">{t('admin.production.unavailable')}</span>
                </div>
                <ul className="divide-y divide-border" aria-label={t('admin.production.availability')}>
                  {rows.map((row) => (
                    <InventoryRow
                      key={row.productId}
                      row={row}
                      draft={edits[row.productId] ?? draftFromRow(row)}
                      dirty={!!edits[row.productId]}
                      readOnly={readOnly}
                      violationCommitted={violations[row.productId]}
                      onChange={(d) => {
                        setEdits((e) => ({ ...e, [row.productId]: d }));
                        setViolations((v) => {
                          if (!(row.productId in v)) return v;
                          const next = { ...v };
                          delete next[row.productId];
                          return next;
                        });
                      }}
                    />
                  ))}
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">{t('admin.production.bufferHint')}</p>
              {!readOnly && (
                <div className={`flex flex-col gap-2 rounded-lg border border-border bg-surface/95 p-3 sm:flex-row sm:items-center sm:justify-between ${dirtyIds.length > 0 ? 'sticky bottom-20 z-10 shadow-raised backdrop-blur lg:bottom-4' : ''}`}>
                  <span className="text-sm text-muted-foreground" aria-live="polite">
                    {dirtyIds.length > 0 ? `${t('admin.production.unsaved')} (${dirtyIds.length})` : ' '}
                  </span>
                  <div className="flex gap-2">
                    {dirtyIds.length > 0 && (
                      <Button variant="ghost" onClick={() => setEdits({})}>
                        {t('app.cancel')}
                      </Button>
                    )}
                    <Button size="lg" onClick={() => save.mutate()} loading={save.isPending} disabled={dirtyIds.length === 0 || hasErrors}>
                      <Save aria-hidden="true" />
                      {t('admin.production.save')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ProductionOverview query={overviewQ} />

      <CopyDayDialog open={copyOpen} onOpenChange={setCopyOpen} defaultSource={addDays(date, -1)} busy={bulk.isPending} onSubmit={(sourceDate, overwrite) => bulk.mutate({ kind: 'copy', sourceDate, overwrite })} />
      <ApplyDefaultsDialog open={defaultsOpen} onOpenChange={setDefaultsOpen} busy={bulk.isPending} onSubmit={(overwrite) => bulk.mutate({ kind: 'defaults', overwrite })} />
    </div>
  );
}

function ProductionOverview({ query }: { query: UseQueryResult<ProductionOverviewDto> }) {
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    if (isApiError(query.error) && query.error.isPlanFeature) {
      return (
        <Alert
          tone="info"
          title={t('admin.production.planFeatureTitle')}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/einstellungen#abonnement">
                <Sparkles aria-hidden="true" />
                {t('admin.settings.subscription')}
              </Link>
            </Button>
          }
        >
          {query.error.title} {t('errors.planFeatureHint')}
        </Alert>
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const data = query.data!;
  const slotStarts = data.slots.map((s) => s.slotStart);
  const totals = data.products.reduce(
    (acc, p) => ({ planned: acc.planned + p.plannedQuantity, reserved: acc.reserved + p.reservedQuantity, collected: acc.collected + p.collectedQuantity, remaining: acc.remaining + p.remaining }),
    { planned: 0, reserved: 0, collected: 0, remaining: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.production.overview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.products.length === 0 ? (
          <p className="text-muted-foreground">{t('admin.production.overviewEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-[0.95rem]">
              <caption className="sr-only">{t('admin.production.overview')}</caption>
              <thead className="border-b border-border text-sm text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('admin.production.product')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('admin.production.planned')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('admin.production.reserved')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('admin.production.collected')}</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">{t('admin.production.remaining')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.products.map((p) => (
                  <tr key={p.productId}>
                    <th scope="row" className="py-2 pr-3 font-medium">
                      {p.productName}
                      {p.isUnavailable && <span className="ml-2 text-xs text-muted-foreground">({t('admin.production.unavailable')})</span>}
                    </th>
                    <td className="px-3 py-2 text-right tabular">{p.plannedQuantity}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular">{p.reservedQuantity}</td>
                    <td className="px-3 py-2 text-right tabular">{p.collectedQuantity}</td>
                    <td className={`py-2 pl-3 text-right tabular ${p.isLowStock ? 'font-semibold text-warning' : ''}`}>{p.remaining}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <tr>
                  <th scope="row" className="py-2 pr-3">{t('admin.production.sum')}</th>
                  <td className="px-3 py-2 text-right tabular">{totals.planned}</td>
                  <td className="px-3 py-2 text-right tabular">{totals.reserved}</td>
                  <td className="px-3 py-2 text-right tabular">{totals.collected}</td>
                  <td className="py-2 pl-3 text-right tabular">{totals.remaining}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {data.slots.length > 0 && data.products.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold">{t('admin.production.bySlot')}</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t('admin.production.bySlot')}</caption>
                <thead className="bg-surface-muted/60 text-muted-foreground">
                  <tr>
                    <th scope="col" className="sticky left-0 bg-surface-muted px-3 py-2 font-medium">{t('admin.production.product')}</th>
                    {data.slots.map((s) => (
                      <th key={s.slotStart} scope="col" className="px-2 py-2 text-right font-medium whitespace-nowrap tabular">
                        {s.slotStart}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.products.map((p) => (
                    <tr key={p.productId}>
                      <th scope="row" className="sticky left-0 bg-surface px-3 py-2 font-medium whitespace-nowrap">{p.productName}</th>
                      {slotStarts.map((start) => {
                        const q = p.bySlot.find((b) => b.slotStart === start)?.quantity ?? 0;
                        return (
                          <td key={start} className={`px-2 py-2 text-right tabular ${q ? 'font-semibold' : 'text-subtle-foreground'}`}>
                            {q || '–'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-surface-muted/40">
                    <th scope="row" className="sticky left-0 bg-surface-muted px-3 py-2 font-medium">{t('admin.production.slotOrders')}</th>
                    {data.slots.map((s) => (
                      <td key={s.slotStart} className="px-2 py-2 text-right tabular">
                        {s.orderCount}
                        {s.maxOrders ? <span className="text-muted-foreground">/{s.maxOrders}</span> : null}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('admin.production.slotCapacity')}: {data.slots[0] ? formatTime(data.slots[0].slotStart) : ''} – {formatTime(data.slots.at(-1)!.slotEnd)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CopyDayDialog({
  open,
  onOpenChange,
  defaultSource,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSource: string;
  busy: boolean;
  onSubmit: (sourceDate: string, overwrite: boolean) => void;
}) {
  const [source, setSource] = useState(defaultSource);
  const [overwrite, setOverwrite] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.production.copyDayTitle')}</DialogTitle>
          <DialogDescription>{t('admin.production.overwriteHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="copy-source">{t('admin.production.sourceDate')}</Label>
          <Input id="copy-source" type="date" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <label className="flex items-center gap-3">
          <Switch checked={overwrite} onCheckedChange={setOverwrite} />
          <span>{t('admin.production.overwrite')}</span>
        </label>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {t('app.cancel')}
          </Button>
          <Button size="lg" loading={busy} disabled={!source} onClick={() => onSubmit(source, overwrite)}>
            {t('admin.production.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDefaultsDialog({ open, onOpenChange, busy, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; onSubmit: (overwrite: boolean) => void }) {
  const [overwrite, setOverwrite] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.production.applyDefaultsTitle')}</DialogTitle>
          <DialogDescription>{t('admin.production.applyDefaultsText')}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-3">
          <Switch checked={overwrite} onCheckedChange={setOverwrite} />
          <span>{t('admin.production.overwrite')}</span>
        </label>
        <p className="text-sm text-muted-foreground">{t('admin.production.overwriteHint')}</p>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {t('app.cancel')}
          </Button>
          <Button size="lg" loading={busy} onClick={() => onSubmit(overwrite)}>
            {t('admin.production.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
