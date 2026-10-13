import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { LocationDto } from '@/api/types';
import { EmptyState, ListSkeleton, PageHeader } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, fieldAria, Input, Label, NativeSelect } from '@/components/ui/input';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { applyServerErrors } from '@/lib/formErrors';
import { formatDateLong, todayIso } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import { useAdmin } from '../AdminContext';
import {
  draftToRule,
  emptyLocationForm,
  formToLocationRequest,
  locationFormSchema,
  locationToForm,
  ruleToDraft,
  TIME_ZONES,
  validateScheduleRow,
  type LocationFormValues,
  type ScheduleRowDraft,
} from './locationSchema';

export default function LocationsPage() {
  useDocumentTitle(t('admin.locations.title'));
  const { locations, locationsLoading, can } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const selectedId = params.get('id');
  const selected = locations.find((l) => l.id === selectedId) ?? locations[0];

  return (
    <div>
      <PageHeader
        title={t('admin.locations.title')}
        actions={
          can('LocationsManage') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              {t('admin.locations.new')}
            </Button>
          ) : undefined
        }
      />
      {locationsLoading ? (
        <ListSkeleton rows={2} />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-6" />}
          title={t('admin.locations.empty')}
          description={t('admin.locations.emptyHint')}
          action={
            can('LocationsManage') ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" />
                {t('admin.locations.new')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="space-y-2" aria-label={t('admin.locations.title')}>
            {locations.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-current={selected?.id === l.id ? 'true' : undefined}
                  onClick={() => setParams({ id: l.id }, { replace: true })}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
                    selected?.id === l.id ? 'border-foreground bg-surface shadow-raised' : 'border-border bg-surface hover:border-foreground',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2 font-semibold">
                    {l.name}
                    {!l.isActive && <Badge tone="neutral">{t('admin.locations.inactive')}</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {l.street}, {l.postalCode} {l.city}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && <LocationDetail key={selected.id} location={selected} />}
        </div>
      )}
      <LocationCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(l) => setParams({ id: l.id }, { replace: true })} />
    </div>
  );
}

function useInvalidateLocations() {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  return (updated?: LocationDto) => {
    if (updated) queryClient.setQueryData<LocationDto[]>(key('locations'), (old) => old?.map((l) => (l.id === updated.id ? updated : l)));
    void queryClient.invalidateQueries({ queryKey: key('locations') });
  };
}

function LocationDetail({ location }: { location: LocationDto }) {
  const { can } = useAdmin();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2" className="text-lg">
            {location.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {location.street}, {location.postalCode} {location.city}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basics">
          <TabsList>
            <TabsTrigger value="basics">{t('admin.locations.tabBasics')}</TabsTrigger>
            {can('PickupScheduleManage') && <TabsTrigger value="schedule">{t('admin.locations.tabSchedule')}</TabsTrigger>}
            {can('PickupScheduleManage') && <TabsTrigger value="closures">{t('admin.locations.tabClosures')}</TabsTrigger>}
          </TabsList>
          <TabsContent value="basics">
            <LocationEditForm location={location} />
          </TabsContent>
          <TabsContent value="schedule">
            <ScheduleEditor location={location} />
          </TabsContent>
          <TabsContent value="closures">
            <Closures location={location} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

const locationFields: (keyof LocationFormValues)[] = Object.keys(emptyLocationForm) as (keyof LocationFormValues)[];
const mapLocationKey = (k: string) => k.replace(/^settings\./i, '');

function LocationFields({ form, basicsReadOnly }: { form: UseFormReturn<LocationFormValues>; basicsReadOnly?: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const e = (k: keyof LocationFormValues) => errors[k]?.message;
  return (
    <div className="space-y-6">
      <fieldset className="space-y-4" disabled={basicsReadOnly}>
        <legend className="sr-only">{t('admin.locations.tabBasics')}</legend>
        {basicsReadOnly && <Alert tone="info">{t('admin.locations.readOnlyBasics')}</Alert>}
        <Field id="l-name" label={t('admin.locations.name')} required error={e('name')}>
          <Input {...fieldAria('l-name', e('name'))} {...register('name')} />
        </Field>
        <Field id="l-street" label={t('admin.locations.street')} required error={e('street')}>
          <Input {...fieldAria('l-street', e('street'))} autoComplete="street-address" {...register('street')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_8rem]">
          <Field id="l-zip" label={t('admin.locations.postalCode')} required error={e('postalCode')}>
            <Input {...fieldAria('l-zip', e('postalCode'))} inputMode="numeric" autoComplete="postal-code" {...register('postalCode')} />
          </Field>
          <Field id="l-city" label={t('admin.locations.city')} required error={e('city')}>
            <Input {...fieldAria('l-city', e('city'))} autoComplete="address-level2" {...register('city')} />
          </Field>
          <Field id="l-country" label={t('admin.locations.country')} error={e('country')}>
            <Input {...fieldAria('l-country', e('country'))} maxLength={2} {...register('country')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="l-phone" label={t('admin.locations.phone')} optional error={e('phone')}>
            <Input {...fieldAria('l-phone', e('phone'))} type="tel" {...register('phone')} />
          </Field>
          <Field id="l-email" label={t('admin.locations.email')} optional error={e('email')}>
            <Input {...fieldAria('l-email', e('email'))} type="email" {...register('email')} />
          </Field>
        </div>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <label className="flex items-start gap-3">
              <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              <span>
                <span className="font-medium">{t('admin.locations.active')}</span>
                <span className="block text-sm text-muted-foreground">{t('admin.locations.activeHint')}</span>
              </span>
            </label>
          )}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-semibold">{t('admin.locations.ordering')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="l-tz" label={t('admin.locations.timeZone')} error={e('timeZoneId')}>
            <NativeSelect {...fieldAria('l-tz', e('timeZoneId'))} {...register('timeZoneId')}>
              {TIME_ZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Controller
            control={control}
            name="acceptsOrders"
            render={({ field }) => (
              <label className="flex items-center gap-3 sm:pt-7">
                <Switch checked={field.value} onCheckedChange={field.onChange} />
                <span className="font-medium">{t('admin.locations.acceptsOrders')}</span>
              </label>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="l-cutoff-days" label={t('admin.locations.cutoffDays')} hint={t('admin.locations.cutoffHint')} error={e('orderCutoffDaysBefore')}>
            <Input {...fieldAria('l-cutoff-days', e('orderCutoffDaysBefore'), true)} type="number" min={0} max={14} {...register('orderCutoffDaysBefore')} />
          </Field>
          <Field id="l-cutoff-time" label={t('admin.locations.cutoffTime')} error={e('orderCutoffTime')}>
            <Input {...fieldAria('l-cutoff-time', e('orderCutoffTime'))} type="time" {...register('orderCutoffTime')} />
          </Field>
          <Field id="l-min-advance" label={t('admin.locations.minAdvance')} error={e('minAdvanceMinutes')}>
            <Input {...fieldAria('l-min-advance', e('minAdvanceMinutes'))} type="number" min={0} {...register('minAdvanceMinutes')} />
          </Field>
          <Field id="l-max-days" label={t('admin.locations.maxDaysAhead')} error={e('maxDaysAhead')}>
            <Input {...fieldAria('l-max-days', e('maxDaysAhead'))} type="number" min={1} max={90} {...register('maxDaysAhead')} />
          </Field>
          <Field id="l-cancel-days" label={t('admin.locations.cancelDays')} error={e('cancellationCutoffDaysBefore')}>
            <Input {...fieldAria('l-cancel-days', e('cancellationCutoffDaysBefore'))} type="number" min={0} max={14} {...register('cancellationCutoffDaysBefore')} />
          </Field>
          <Field id="l-cancel-time" label={t('admin.locations.cancelTime')} error={e('cancellationCutoffTime')}>
            <Input {...fieldAria('l-cancel-time', e('cancellationCutoffTime'))} type="time" {...register('cancellationCutoffTime')} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}

function LocationEditForm({ location }: { location: LocationDto }) {
  const { can } = useAdmin();
  const invalidate = useInvalidateLocations();
  const [formError, setFormError] = useState<string | null>(null);
  const canBasics = can('LocationsManage');
  const canSettings = can('PickupScheduleManage');
  const form = useForm<LocationFormValues>({ resolver: zodResolver(locationFormSchema), defaultValues: locationToForm(location) });

  const onSubmit = async (values: LocationFormValues) => {
    setFormError(null);
    try {
      const request = formToLocationRequest(values);
      const updated = canBasics ? await adminApi.updateLocation(location.id, request) : await adminApi.updateLocationSettings(location.id, request.settings);
      invalidate(updated);
      form.reset(locationToForm(updated));
      toast.success(t('admin.locations.saved'));
    } catch (error) {
      if (!applyServerErrors(error, form.setError, locationFields, mapLocationKey)) setFormError(errorMessage(error));
    }
  };

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <LocationFields form={form} basicsReadOnly={!canBasics} />
      {(canBasics || canSettings) && (
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            <Save aria-hidden="true" />
            {t('app.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

function LocationCreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (l: LocationDto) => void }) {
  const invalidate = useInvalidateLocations();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LocationFormValues>({ resolver: zodResolver(locationFormSchema), defaultValues: emptyLocationForm });
  const onSubmit = async (values: LocationFormValues) => {
    setFormError(null);
    try {
      const created = await adminApi.createLocation(formToLocationRequest(values));
      invalidate();
      toast.success(t('admin.locations.created'));
      form.reset(emptyLocationForm);
      onOpenChange(false);
      onCreated(created);
    } catch (error) {
      if (!applyServerErrors(error, form.setError, locationFields, mapLocationKey)) setFormError(errorMessage(error));
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !form.formState.isSubmitting && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('admin.locations.new')}</DialogTitle>
          <DialogDescription>{t('admin.locations.emptyHint')}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <LocationFields form={form} />
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              {t('app.cancel')}
            </Button>
            <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
              {t('app.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleEditor({ location }: { location: LocationDto }) {
  const invalidate = useInvalidateLocations();
  const [rows, setRows] = useState<ScheduleRowDraft[]>(() => location.schedule.map(ruleToDraft));
  const [showErrors, setShowErrors] = useState(false);
  const errors = rows.map(validateScheduleRow);
  const hasErrors = errors.some((e) => Object.keys(e).length > 0);
  const save = useMutation({
    mutationFn: () => adminApi.updateSchedule({ locationId: location.id, rules: rows.map(draftToRule) }),
    onSuccess: (updated) => {
      invalidate(updated);
      setRows(updated.schedule.map(ruleToDraft));
      toast.success(t('admin.locations.scheduleSaved'));
    },
    onError: (e) => toast.fromError(e),
  });
  const update = (i: number, patch: Partial<ScheduleRowDraft>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const timeField = (i: number, field: 'opensAt' | 'closesAt' | 'pickupStart' | 'pickupEnd', label: string, disabled: boolean) => {
    const error = showErrors ? errors[i]?.[field] : undefined;
    const id = `s-${rows[i]!.dayOfWeek}-${field}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
        <Input id={id} type="time" value={rows[i]![field]} disabled={disabled} onChange={(e) => update(i, { [field]: e.target.value })} aria-invalid={error ? true : undefined} className="h-10" />
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  };
  const numberField = (i: number, field: 'slotMinutes' | 'maxOrdersPerSlot' | 'maxItemsPerSlot', label: string, disabled: boolean, placeholder?: string) => {
    const error = showErrors ? errors[i]?.[field] : undefined;
    const id = `s-${rows[i]!.dayOfWeek}-${field}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          value={rows[i]![field]}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => update(i, { [field]: e.target.value })}
          aria-invalid={error ? true : undefined}
          className="h-10"
        />
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('admin.locations.scheduleHint')}</p>
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.dayOfWeek} className={cn('rounded-lg border border-border p-3', !row.isOpen && 'bg-surface-muted/50')} data-testid={`schedule-${row.dayOfWeek}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-semibold">{t(`days.${row.dayOfWeek}`)}</span>
              <label className="flex items-center gap-2 text-sm">
                <span>{t('admin.locations.open')}</span>
                <Switch checked={row.isOpen} onCheckedChange={(v) => update(i, { isOpen: v })} aria-label={`${t(`days.${row.dayOfWeek}`)}: ${t('admin.locations.open')}`} />
              </label>
            </div>
            {row.isOpen && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                {timeField(i, 'opensAt', t('admin.locations.opensAt'), false)}
                {timeField(i, 'closesAt', t('admin.locations.closesAt'), false)}
                {timeField(i, 'pickupStart', t('admin.locations.pickupStart'), false)}
                {timeField(i, 'pickupEnd', t('admin.locations.pickupEnd'), false)}
                {numberField(i, 'slotMinutes', t('admin.locations.slotMinutes'), false)}
                {numberField(i, 'maxOrdersPerSlot', t('admin.locations.maxOrders'), false)}
                {numberField(i, 'maxItemsPerSlot', t('admin.locations.maxItems'), false, t('admin.locations.maxItemsPlaceholder'))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button
          size="lg"
          loading={save.isPending}
          onClick={() => {
            if (hasErrors) {
              setShowErrors(true);
              toast.error(t('errors.validation'));
              return;
            }
            save.mutate();
          }}
        >
          <Save aria-hidden="true" />
          {t('app.save')}
        </Button>
      </div>
    </div>
  );
}

function Closures({ location }: { location: LocationDto }) {
  const invalidate = useInvalidateLocations();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => adminApi.addClosure(location.id, { date, reason: reason.trim() || null }),
    onSuccess: (updated) => {
      invalidate(updated);
      setDate('');
      setReason('');
      toast.success(t('admin.locations.closureAdded'));
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (closureId: string) => adminApi.removeClosure(location.id, closureId),
    onSuccess: (updated) => {
      invalidate(updated);
      toast.success(t('admin.locations.closureRemoved'));
    },
    onError: (e) => toast.fromError(e),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('admin.locations.closuresHint')}</p>
      <form
        noValidate
        className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date) {
            setError(t('validation.dateRequired'));
            return;
          }
          setError(null);
          add.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="closure-date">{t('admin.locations.closureDate')}</Label>
          <Input id="closure-date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="closure-reason">{t('admin.locations.closureReason')}</Label>
          <Input id="closure-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="submit" loading={add.isPending}>
          <Plus aria-hidden="true" />
          {t('admin.locations.closureAdd')}
        </Button>
      </form>
      {error && (
        <Alert tone="danger" live>
          {error}
        </Alert>
      )}
      {location.closures.length === 0 ? (
        <EmptyState icon={<CalendarOff className="size-6" />} title={t('admin.locations.closuresEmpty')} className="py-6" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {location.closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{formatDateLong(c.date, true)}</p>
                {c.reason && <p className="text-sm text-muted-foreground">{c.reason}</p>}
              </div>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label={t('admin.locations.closureRemove', { date: formatDateLong(c.date) })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                }
                title={t('admin.locations.closureRemove', { date: formatDateLong(c.date) })}
                confirmLabel={t('app.delete')}
                variant="danger"
                onConfirm={() => remove.mutateAsync(c.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

