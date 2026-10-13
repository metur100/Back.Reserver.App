import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, FlaskConical, Minus, Save } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage, isApiError } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { SubscriptionDto, SubscriptionPlanDto, TenantSettingsDto, UpdateTenantSettingsRequest } from '@/api/types';
import { ImageUpload } from '@/components/common/ImageUpload';
import { ErrorState, ListSkeleton, PageHeader } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Field, fieldAria, Input, Textarea } from '@/components/ui/input';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { EMAIL_REGEX, PHONE_REGEX } from '@/features/public/checkoutSchema';
import { applyServerErrors } from '@/lib/formErrors';
import { formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { isSafeImageUrl } from '../products/productSchema';
import { useAdmin } from '../AdminContext';

const settingsSchema = z.object({
  name: z.string().trim().min(1, t('validation.bakeryName')).max(120),
  description: z.string().max(1000, t('validation.maxLength', { max: 1000 })),
  logoUrl: z.string().refine(isSafeImageUrl, t('validation.url')),
  coverImageUrl: z.string().refine(isSafeImageUrl, t('validation.url')),
  brandColor: z.string().trim().refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), t('validation.brandColor')),
  contactEmail: z.string().trim().refine((v) => v === '' || EMAIL_REGEX.test(v), t('validation.emailAdmin')),
  contactPhone: z.string().trim().refine((v) => v === '' || PHONE_REGEX.test(v), t('validation.phoneAdmin')),
  website: z.string().trim().refine((v) => v === '' || (isSafeImageUrl(v) && !v.startsWith('/')), t('validation.url')),
  isPublished: z.boolean(),
  requireCustomerLastName: z.boolean(),
  requireCustomerPhone: z.boolean(),
  sendReadyNotification: z.boolean(),
  sendPickupReminder: z.boolean(),
  pickupReminderHoursBefore: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 72, t('validation.reminderHours')),
  pickupInstructions: z.string().max(1000, t('validation.maxLength', { max: 1000 })),
  cancellationPolicyText: z.string().max(1000, t('validation.maxLength', { max: 1000 })),
  allergenDisclaimer: z.string().max(1000, t('validation.maxLength', { max: 1000 })),
  customerDataRetentionDays: z.string().refine((v) => /^\d+$/.test(v) && Number(v) <= 3650, t('validation.retentionDays')),
});
type SettingsValues = z.infer<typeof settingsSchema>;

function toForm(s: TenantSettingsDto): SettingsValues {
  return {
    name: s.name,
    description: s.description ?? '',
    logoUrl: s.logoUrl ?? '',
    coverImageUrl: s.coverImageUrl ?? '',
    brandColor: s.brandColor ?? '',
    contactEmail: s.contactEmail ?? '',
    contactPhone: s.contactPhone ?? '',
    website: s.website ?? '',
    isPublished: s.isPublished,
    requireCustomerLastName: s.requireCustomerLastName,
    requireCustomerPhone: s.requireCustomerPhone,
    sendReadyNotification: s.sendReadyNotification,
    sendPickupReminder: s.sendPickupReminder,
    pickupReminderHoursBefore: String(s.pickupReminderHoursBefore),
    pickupInstructions: s.pickupInstructions ?? '',
    cancellationPolicyText: s.cancellationPolicyText ?? '',
    allergenDisclaimer: s.allergenDisclaimer ?? '',
    customerDataRetentionDays: String(s.customerDataRetentionDays),
  };
}

const n = (v: string) => (v.trim() ? v.trim() : null);
function toRequest(v: SettingsValues): UpdateTenantSettingsRequest {
  return {
    name: v.name.trim(),
    description: n(v.description),
    logoUrl: n(v.logoUrl),
    coverImageUrl: n(v.coverImageUrl),
    brandColor: n(v.brandColor),
    contactEmail: n(v.contactEmail),
    contactPhone: n(v.contactPhone),
    website: n(v.website),
    isPublished: v.isPublished,
    requireCustomerLastName: v.requireCustomerLastName,
    requireCustomerPhone: v.requireCustomerPhone,
    sendReadyNotification: v.sendReadyNotification,
    sendPickupReminder: v.sendPickupReminder,
    pickupReminderHoursBefore: Number(v.pickupReminderHoursBefore),
    pickupInstructions: n(v.pickupInstructions),
    cancellationPolicyText: n(v.cancellationPolicyText),
    allergenDisclaimer: n(v.allergenDisclaimer),
    customerDataRetentionDays: Number(v.customerDataRetentionDays),
  };
}

export default function SettingsPage() {
  useDocumentTitle(t('admin.settings.title'));
  const { key, can } = useAdmin();
  const settingsQ = useQuery({ queryKey: key('settings'), queryFn: adminApi.settings });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('admin.settings.title')} />
      {settingsQ.isPending ? (
        <ListSkeleton rows={4} />
      ) : settingsQ.isError ? (
        <ErrorState error={settingsQ.error} onRetry={() => void settingsQ.refetch()} />
      ) : (
        <SettingsForm settings={settingsQ.data} readOnly={!can('SettingsManage')} />
      )}
      <SubscriptionSection />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function ToggleRow({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function SettingsForm({ settings, readOnly }: { settings: TenantSettingsDto; readOnly: boolean }) {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema), defaultValues: toForm(settings) });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const brandColor = useWatch({ control, name: 'brandColor' });
  const sendReminder = useWatch({ control, name: 'sendPickupReminder' });
  const publicUrl = `${window.location.origin}${import.meta.env.BASE_URL}b/${settings.slug}`;
  const e = (k: keyof SettingsValues) => errors[k]?.message;

  const onSubmit = async (values: SettingsValues) => {
    setFormError(null);
    try {
      const updated = await adminApi.updateSettings(toRequest(values));
      queryClient.setQueryData(key('settings'), updated);
      void queryClient.invalidateQueries({ queryKey: ['public'] });
      form.reset(toForm(updated));
      toast.success(t('admin.settings.saved'));
    } catch (error) {
      if (!applyServerErrors(error, form.setError, Object.keys(toForm(settings)) as (keyof SettingsValues)[])) {
        setFormError(isApiError(error) && error.isPlanFeature ? `${error.title} ${t('admin.settings.brandingPlanHint')}` : errorMessage(error));
      }
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <fieldset disabled={readOnly} className="space-y-4">
        <Section title={t('admin.settings.publishing')} description={t('admin.settings.publishHint')}>
          <Controller
            control={control}
            name="isPublished"
            render={({ field }) => <ToggleRow checked={field.value} onChange={field.onChange} label={t('admin.settings.publish')} disabled={readOnly} />}
          />
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t('admin.settings.publicLink')}</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="flex min-h-11 flex-1 items-center rounded-md border border-border bg-surface-muted px-3 text-sm break-all" data-testid="public-link">
                {publicUrl}
              </code>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(publicUrl);
                      setCopied(true);
                      toast.success(t('admin.settings.linkCopied'));
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      toast.error(t('errors.unexpected'));
                    }
                  }}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {t('admin.settings.copyLink')}
                </Button>
                <Button asChild variant="ghost" size="icon">
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label={t('admin.nav.publicPage')}>
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Section>

        <Section title={t('admin.settings.profile')}>
          <Field id="s-name" label={t('admin.settings.name')} required error={e('name')}>
            <Input {...fieldAria('s-name', e('name'))} {...register('name')} />
          </Field>
          <Field id="s-description" label={t('admin.settings.description')} optional error={e('description')}>
            <Textarea {...fieldAria('s-description', e('description'))} rows={3} {...register('description')} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Controller
              control={control}
              name="logoUrl"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">{t('admin.settings.logo')}</span>
                  <ImageUpload value={field.value} onChange={field.onChange} label={t('admin.settings.logo')} aspect="square" disabled={readOnly} />
                </div>
              )}
            />
            <Controller
              control={control}
              name="coverImageUrl"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">{t('admin.settings.cover')}</span>
                  <ImageUpload value={field.value} onChange={field.onChange} label={t('admin.settings.cover')} aspect="wide" disabled={readOnly} />
                </div>
              )}
            />
          </div>
          <Field id="s-color" label={t('admin.settings.brandColor')} hint={t('admin.settings.brandingPlanHint')} error={e('brandColor')}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t('admin.settings.brandColor')}
                value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#B5562B'}
                onChange={(ev) => form.setValue('brandColor', ev.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })}
                className="h-11 w-14 cursor-pointer rounded-md border border-input bg-surface p-1"
              />
              <Input {...fieldAria('s-color', e('brandColor'), true)} placeholder="#B5562B" className="w-36 font-mono" {...register('brandColor')} />
            </div>
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="s-email" label={t('admin.settings.contactEmail')} optional error={e('contactEmail')}>
              <Input {...fieldAria('s-email', e('contactEmail'))} type="email" {...register('contactEmail')} />
            </Field>
            <Field id="s-phone" label={t('admin.settings.contactPhone')} optional error={e('contactPhone')}>
              <Input {...fieldAria('s-phone', e('contactPhone'))} type="tel" {...register('contactPhone')} />
            </Field>
            <Field id="s-website" label={t('admin.settings.website')} optional error={e('website')}>
              <Input {...fieldAria('s-website', e('website'))} type="url" placeholder="https://" {...register('website')} />
            </Field>
          </div>
        </Section>

        <Section title={t('admin.settings.customerFields')}>
          <Controller control={control} name="requireCustomerLastName" render={({ field }) => <ToggleRow checked={field.value} onChange={field.onChange} label={t('admin.settings.requireLastName')} disabled={readOnly} />} />
          <Controller control={control} name="requireCustomerPhone" render={({ field }) => <ToggleRow checked={field.value} onChange={field.onChange} label={t('admin.settings.requirePhone')} disabled={readOnly} />} />
        </Section>

        <Section title={t('admin.settings.notifications')}>
          <Controller control={control} name="sendReadyNotification" render={({ field }) => <ToggleRow checked={field.value} onChange={field.onChange} label={t('admin.settings.readyEmail')} disabled={readOnly} />} />
          <Controller control={control} name="sendPickupReminder" render={({ field }) => <ToggleRow checked={field.value} onChange={field.onChange} label={t('admin.settings.reminder')} disabled={readOnly} />} />
          {sendReminder && (
            <Field id="s-reminder" label={t('admin.settings.reminderHours')} error={e('pickupReminderHoursBefore')} className="max-w-48">
              <Input {...fieldAria('s-reminder', e('pickupReminderHoursBefore'))} type="number" min={1} max={72} {...register('pickupReminderHoursBefore')} />
            </Field>
          )}
        </Section>

        <Section title={t('admin.settings.texts')}>
          <Field id="s-pickup" label={t('admin.settings.pickupInstructions')} optional error={e('pickupInstructions')}>
            <Textarea {...fieldAria('s-pickup', e('pickupInstructions'))} rows={2} {...register('pickupInstructions')} />
          </Field>
          <Field id="s-cancel" label={t('admin.settings.cancellationPolicy')} optional error={e('cancellationPolicyText')}>
            <Textarea {...fieldAria('s-cancel', e('cancellationPolicyText'))} rows={2} {...register('cancellationPolicyText')} />
          </Field>
          <Field id="s-allergen" label={t('admin.settings.allergenDisclaimer')} hint={t('admin.settings.allergenDisclaimerHint')} error={e('allergenDisclaimer')}>
            <Textarea {...fieldAria('s-allergen', e('allergenDisclaimer'), true)} rows={2} {...register('allergenDisclaimer')} />
          </Field>
        </Section>

        <Section title={t('admin.settings.privacy')}>
          <Field id="s-retention" label={t('admin.settings.retention')} hint={t('admin.settings.retentionHint')} error={e('customerDataRetentionDays')} className="max-w-xl">
            <Input {...fieldAria('s-retention', e('customerDataRetentionDays'), true)} type="number" min={0} max={3650} className="max-w-40" {...register('customerDataRetentionDays')} />
          </Field>
        </Section>
      </fieldset>
      {!readOnly && (
        <div className={`flex justify-end rounded-lg border border-border bg-surface/95 p-3 ${isDirty ? 'sticky bottom-20 z-10 shadow-raised backdrop-blur lg:bottom-4' : ''}`}>
          <Button type="submit" size="lg" loading={isSubmitting} disabled={!isDirty}>
            <Save aria-hidden="true" />
            {t('app.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

function SubscriptionSection() {
  const { key, can } = useAdmin();
  const queryClient = useQueryClient();
  const subQ = useQuery({ queryKey: key('subscription'), queryFn: adminApi.subscription });
  const plansQ = useQuery({ queryKey: key('plans'), queryFn: adminApi.plans });
  const change = useMutation({
    mutationFn: (code: string) => adminApi.changePlan(code),
    onSuccess: (sub: SubscriptionDto) => {
      queryClient.setQueryData(key('subscription'), sub);
      void queryClient.invalidateQueries({ queryKey: key() });
      toast.success(t('admin.settings.planChanged', { plan: sub.plan.name }));
    },
    onError: (e) => toast.fromError(e),
  });

  return (
    <section id="abonnement" className="mt-8 scroll-mt-20 space-y-4" aria-labelledby="subscription-heading">
      <h2 id="subscription-heading" className="font-display text-xl font-semibold">
        {t('admin.settings.subscription')}
      </h2>
      {subQ.isPending ? (
        <ListSkeleton rows={2} />
      ) : subQ.isError ? (
        <ErrorState error={subQ.error} onRetry={() => void subQ.refetch()} compact />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">{t('admin.settings.plan')}</p>
                <p className="text-xl font-semibold">{subQ.data.plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(subQ.data.plan.monthlyPrice, subQ.data.plan.currency)} {t('admin.settings.perMonth')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('admin.settings.status')}</p>
                <Badge tone={subQ.data.status === 'Active' || subQ.data.status === 'Trial' ? 'success' : 'danger'} size="md">
                  {t(`subscriptionStatus.${subQ.data.status}`)}
                </Badge>
                {subQ.data.trialEndsAt && subQ.data.status === 'Trial' && <p className="mt-1 text-sm">{t('admin.settings.trialUntil', { date: formatDateTime(subQ.data.trialEndsAt) })}</p>}
                {subQ.data.currentPeriodEndsAt && <p className="mt-1 text-sm">{t('admin.settings.periodUntil', { date: formatDateTime(subQ.data.currentPeriodEndsAt) })}</p>}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('admin.settings.usage')}</p>
                <UsageBar label={t('admin.settings.usageLocations')} used={subQ.data.locationsUsed} max={subQ.data.plan.maxLocations} />
                <UsageBar label={t('admin.settings.usageProducts')} used={subQ.data.productsUsed} max={subQ.data.plan.maxProducts} />
                <UsageBar label={t('admin.settings.usageStaff')} used={subQ.data.staffUsed} max={subQ.data.plan.maxStaff} />
              </div>
            </CardContent>
          </Card>
          {!subQ.data.billingConfigured && <Alert tone="info">{t('admin.settings.noBilling')}</Alert>}
          {plansQ.data && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{t('admin.settings.plans')}</h3>
                {can('SubscriptionManage') && (
                  <Badge tone="warning">
                    <FlaskConical aria-hidden="true" />
                    {t('admin.settings.devMode')}
                  </Badge>
                )}
              </div>
              {can('SubscriptionManage') && <p className="mb-3 text-sm text-muted-foreground">{t('admin.settings.devModeText')}</p>}
              <div className="grid gap-3 md:grid-cols-3">
                {plansQ.data.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    current={plan.code === subQ.data.plan.code}
                    canChange={can('SubscriptionManage')}
                    busy={change.isPending && change.variables === plan.code}
                    onChoose={() => change.mutateAsync(plan.code)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular">
          {used} / {max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={max}>
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-danger' : 'bg-success'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PlanCard({ plan, current, canChange, busy, onChoose }: { plan: SubscriptionPlanDto; current: boolean; canChange: boolean; busy: boolean; onChoose: () => Promise<unknown> }) {
  const features: [boolean, string][] = [
    [plan.productionPlanning, t('admin.settings.featureProduction')],
    [plan.csvExport, t('admin.settings.featureCsv')],
    [plan.customBranding, t('admin.settings.featureBranding')],
    [plan.emailNotifications, t('admin.settings.featureEmail')],
  ];
  return (
    <Card className={`flex flex-col gap-3 p-4 ${current ? 'border-foreground ring-1 ring-foreground' : ''}`}>
      <div>
        <p className="text-lg font-semibold">{plan.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatMoney(plan.monthlyPrice, plan.currency)} {t('admin.settings.perMonth')}
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        <li>{t('admin.settings.limitLocations', { count: plan.maxLocations })}</li>
        <li>{t('admin.settings.limitProducts', { count: plan.maxProducts })}</li>
        <li>{t('admin.settings.limitStaff', { count: plan.maxStaff })}</li>
        {features.map(([on, label]) => (
          <li key={label} className={`flex items-center gap-1.5 ${on ? '' : 'text-subtle-foreground'}`}>
            {on ? <Check className="size-4 text-success" aria-hidden="true" /> : <Minus className="size-4" aria-hidden="true" />}
            <span>
              {label}
              <span className="sr-only">{on ? ` – ${t('app.yes')}` : ` – ${t('app.no')}`}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        {current ? (
          <Badge tone="success" size="md">
            {t('admin.settings.current')}
          </Badge>
        ) : (
          canChange && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" block loading={busy}>
                  {t('admin.settings.choose')}
                </Button>
              }
              title={`${plan.name} – ${t('admin.settings.devMode')}`}
              description={t('admin.settings.devModeText')}
              confirmLabel={t('admin.settings.choose')}
              onConfirm={onChoose}
            />
          )
        )}
      </div>
    </Card>
  );
}
