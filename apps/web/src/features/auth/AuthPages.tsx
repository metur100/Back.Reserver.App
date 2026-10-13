import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleCheckBig, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { errorMessage, isApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { MeDto } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { PasswordInput } from '@/components/common/PasswordInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Field, fieldAria, Input } from '@/components/ui/input';
import { Alert, Skeleton } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { applyServerErrors } from '@/lib/formErrors';
import { formatDateTime } from '@/lib/format';
import { consumeHashParams } from '@/lib/hash';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AuthCard } from './AuthLayout';
import { emailOnlySchema, loginSchema, newPasswordSchema, registerSchema, slugify, strongPassword, type LoginValues, type NewPasswordValues, type RegisterValues } from './schemas';

/** Where to go after login: requested page, the dashboard, or the platform area. */
export function homeFor(me: MeDto, next?: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  if (me.memberships.length === 0 && me.isPlatformAdmin) return '/platform';
  return '/admin';
}

const hashCache = new Map<string, URLSearchParams>();

/** Reads fragment parameters once per page (StrictMode-safe) and clears them from the address bar. */
function readHashOnce(): URLSearchParams {
  const path = window.location.pathname;
  if (window.location.hash.length > 1) hashCache.set(path, consumeHashParams());
  return hashCache.get(path) ?? new URLSearchParams();
}

function useHashParams() {
  const [params] = useState(readHashOnce);
  return params;
}

function termsLabel(template: string) {
  const [before, rest = ''] = template.split('{terms}');
  const [middle, after = ''] = rest.split('{privacy}');
  return (
    <>
      {before}
      <Link to="/agb" target="_blank" className="font-medium text-primary-strong underline">
        {t('legal.terms')}
      </Link>
      {middle}
      <Link to="/datenschutz" target="_blank" className="font-medium text-primary-strong underline">
        {t('checkout.privacyLink')}
      </Link>
      {after}
    </>
  );
}

// ---------- Login ----------

export function LoginPage() {
  const { status, me, login, sessionExpired, ensureSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle(t('auth.loginTitle'));
  // Restore an existing session silently (refresh cookie) so logged-in users skip the form.
  useEffect(() => {
    if (status === 'idle') void ensureSession();
  }, [status, ensureSession]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  if (status === 'authenticated' && me) return <Navigate to={homeFor(me, next)} replace />;

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    try {
      const user = await login(values);
      navigate(homeFor(user, next), { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <AuthCard title={t('auth.loginTitle')} lead={t('auth.loginLead')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {sessionExpired && !formError && <Alert tone="info">{t('errors.sessionExpired')}</Alert>}
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <Field id="email" label={t('auth.email')} error={errors.email?.message}>
          <Input {...fieldAria('email', errors.email?.message)} type="email" autoComplete="username" inputMode="email" {...register('email')} />
        </Field>
        <Field id="password" label={t('auth.password')} error={errors.password?.message}>
          <PasswordInput {...fieldAria('password', errors.password?.message)} autoComplete="current-password" {...register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/passwort-vergessen" className="text-sm font-medium text-primary-strong hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/registrieren" className="font-medium text-primary-strong hover:underline">
            {t('auth.registerLink')}
          </Link>
        </p>
        {import.meta.env.DEV && <p className="text-center text-xs text-subtle-foreground">{t('auth.demoHint')}</p>}
      </form>
    </AuthCard>
  );
}

// ---------- Registration ----------

export function RegisterPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle(t('auth.registerTitle'));
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', bakeryName: '', slug: '', acceptTerms: false },
  });
  const slug = useWatch({ control, name: 'slug' });
  const bakeryName = useWatch({ control, name: 'bakeryName' });
  const previewSlug = slug?.trim() || slugify(bakeryName ?? '') || 'ihre-baeckerei';

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null);
    try {
      await authApi.registerBakery({ ...values, slug: values.slug.trim() || null });
      setSentTo(values.email);
    } catch (error) {
      if (isApiError(error) && error.code === 'slug_taken') {
        setError('slug', { type: 'server', message: error.title });
        return;
      }
      if (!applyServerErrors(error, setError, ['firstName', 'lastName', 'email', 'password', 'bakeryName', 'slug', 'acceptTerms'])) setFormError(errorMessage(error));
    }
  };

  if (sentTo) {
    return (
      <AuthCard title={t('auth.checkEmailTitle')}>
        <div className="space-y-4" role="status">
          <MailCheck className="size-10 text-success" aria-hidden="true" />
          <p>{t('auth.checkEmailText', { email: sentTo })}</p>
          <Button asChild variant="outline" block>
            <Link to="/login">{t('auth.toLogin')}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.registerTitle')} lead={t('auth.registerLead')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="firstName" label={t('auth.firstName')} required error={errors.firstName?.message}>
            <Input {...fieldAria('firstName', errors.firstName?.message)} autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field id="lastName" label={t('auth.lastName')} required error={errors.lastName?.message}>
            <Input {...fieldAria('lastName', errors.lastName?.message)} autoComplete="family-name" {...register('lastName')} />
          </Field>
        </div>
        <Field id="email" label={t('auth.email')} required error={errors.email?.message}>
          <Input {...fieldAria('email', errors.email?.message)} type="email" autoComplete="email" inputMode="email" {...register('email')} />
        </Field>
        <Field id="password" label={t('auth.password')} required hint={t('auth.passwordHint')} error={errors.password?.message}>
          <PasswordInput {...fieldAria('password', errors.password?.message, true)} autoComplete="new-password" {...register('password')} />
        </Field>
        <Field id="bakeryName" label={t('auth.bakeryName')} required error={errors.bakeryName?.message}>
          <Input {...fieldAria('bakeryName', errors.bakeryName?.message)} autoComplete="organization" {...register('bakeryName')} />
        </Field>
        <Field id="slug" label={t('auth.slug')} optional hint={t('auth.slugHint')} error={errors.slug?.message}>
          <Input {...fieldAria('slug', errors.slug?.message, true)} autoCapitalize="none" spellCheck={false} placeholder={slugify(bakeryName ?? '')} {...register('slug')} />
        </Field>
        <p className="-mt-2 rounded-md bg-surface-muted px-3 py-2 text-sm break-all text-muted-foreground" aria-live="polite">
          {t('auth.slugPreview', { url: `${window.location.host}/b/${previewSlug}` })}
        </p>
        <Controller
          control={control}
          name="acceptTerms"
          render={({ field }) => (
            <div className="space-y-1">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="acceptTerms"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  onBlur={field.onBlur}
                  aria-invalid={errors.acceptTerms ? true : undefined}
                  aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
                  className="mt-0.5"
                />
                <label htmlFor="acceptTerms" className="text-[0.95rem] leading-snug">
                  {termsLabel(t('auth.acceptTerms'))}
                </label>
              </div>
              {errors.acceptTerms && (
                <p id="acceptTerms-error" className="text-sm font-medium text-danger" role="alert">
                  {errors.acceptTerms.message}
                </p>
              )}
            </div>
          )}
        />
        <Button type="submit" block size="lg" loading={isSubmitting}>
          {isSubmitting ? t('auth.registering') : t('auth.register')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-primary-strong hover:underline">
            {t('auth.login')}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

// ---------- Email confirmation ----------

export function ConfirmEmailPage() {
  const params = useHashParams();
  const userId = params.get('uid');
  const token = params.get('token');
  useDocumentTitle(t('auth.confirmTitle'));
  const started = useRef(false);
  const confirm = useMutation({ mutationFn: () => authApi.confirmEmail({ userId: userId!, token: token! }) });
  const { mutate } = confirm;

  useEffect(() => {
    if (started.current || !userId || !token) return;
    started.current = true;
    mutate();
  }, [mutate, userId, token]);

  if (!userId || !token) {
    return (
      <AuthCard title={t('auth.confirmFailedTitle')}>
        <Alert tone="danger">{t('auth.missingLink')}</Alert>
      </AuthCard>
    );
  }
  if (confirm.isSuccess) {
    return (
      <AuthCard title={t('auth.confirmedTitle')}>
        <div className="space-y-4" role="status">
          <CircleCheckBig className="size-10 text-success" aria-hidden="true" />
          <p>{confirm.data.message}</p>
          <Button asChild block size="lg">
            <Link to="/login">{t('auth.toLogin')}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  if (confirm.isError) {
    return (
      <AuthCard title={t('auth.confirmFailedTitle')}>
        <Alert tone="danger" live>
          {errorMessage(confirm.error)}
        </Alert>
        <Button asChild variant="outline" block className="mt-4">
          <Link to="/login">{t('auth.toLogin')}</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.confirmTitle')}>
      <p role="status" className="text-muted-foreground">
        {t('auth.confirming')}
      </p>
    </AuthCard>
  );
}

// ---------- Forgot / reset password ----------

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle(t('auth.forgotTitle'));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(emailOnlySchema), defaultValues: { email: '' } });

  if (message) {
    return (
      <AuthCard title={t('auth.forgotSentTitle')}>
        <div className="space-y-4" role="status">
          <MailCheck className="size-10 text-success" aria-hidden="true" />
          <p>{message}</p>
          <Button asChild variant="outline" block>
            <Link to="/login">{t('auth.toLogin')}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.forgotTitle')} lead={t('auth.forgotLead')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ email }) => {
          setFormError(null);
          try {
            const res = await authApi.forgotPassword({ email });
            setMessage(res.message);
          } catch (error) {
            setFormError(errorMessage(error));
          }
        })}
      >
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <Field id="email" label={t('auth.email')} error={errors.email?.message}>
          <Input {...fieldAria('email', errors.email?.message)} type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          {t('auth.forgotSubmit')}
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary-strong hover:underline">
            {t('auth.toLogin')}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const params = useHashParams();
  const email = params.get('email');
  const token = params.get('token');
  const [done, setDone] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle(t('auth.resetTitle'));
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', repeat: '' } });

  if (!email || !token) {
    return (
      <AuthCard title={t('auth.resetTitle')}>
        <Alert tone="danger">{t('auth.missingLink')}</Alert>
        <Button asChild variant="outline" block className="mt-4">
          <Link to="/passwort-vergessen">{t('auth.forgotSubmit')}</Link>
        </Button>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title={t('auth.resetDoneTitle')}>
        <div className="space-y-4" role="status">
          <CircleCheckBig className="size-10 text-success" aria-hidden="true" />
          <p>{done}</p>
          <Button asChild block size="lg">
            <Link to="/login">{t('auth.toLogin')}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.resetTitle')} lead={email}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ password }) => {
          setFormError(null);
          try {
            const res = await authApi.resetPassword({ email, token, newPassword: password });
            setDone(res.message);
          } catch (error) {
            if (!applyServerErrors(error, setError, ['password'], (k) => (k === 'newPassword' ? 'password' : k))) setFormError(errorMessage(error));
          }
        })}
      >
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <Field id="password" label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={errors.password?.message}>
          <PasswordInput {...fieldAria('password', errors.password?.message, true)} autoComplete="new-password" {...register('password')} />
        </Field>
        <Field id="repeat" label={t('auth.passwordRepeat')} error={errors.repeat?.message}>
          <PasswordInput {...fieldAria('repeat', errors.repeat?.message)} autoComplete="new-password" {...register('repeat')} />
        </Field>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          {t('auth.resetSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}

// ---------- Invitation ----------

const newAccountSchema = z.object({
  firstName: z.string().trim().min(1, t('validation.adminFirstName')).max(80),
  lastName: z.string().trim().min(1, t('validation.adminLastName')).max(80),
  password: strongPassword,
});
const existingAccountSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  password: z.string().min(1, t('validation.loginPassword')).max(128),
});
type InvitationValues = z.infer<typeof newAccountSchema>;

export function InvitationPage() {
  const params = useHashParams();
  const token = params.get('t');
  const { applyAuth } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle(t('auth.inviteTitle'));

  const info = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => authApi.inspectInvitation(token!),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  const accountExists = info.data?.accountExists ?? false;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationValues>({
    resolver: zodResolver(accountExists ? existingAccountSchema : newAccountSchema),
    defaultValues: { firstName: '', lastName: '', password: '' },
  });

  if (!token) {
    return (
      <AuthCard title={t('auth.inviteInvalidTitle')}>
        <Alert tone="danger">{t('auth.missingLink')}</Alert>
      </AuthCard>
    );
  }
  if (info.isPending) {
    return (
      <AuthCard title={t('auth.inviteTitle')}>
        <div className="space-y-3" role="status" aria-label={t('app.loading')}>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthCard>
    );
  }
  if (info.isError) {
    return (
      <AuthCard title={t('auth.inviteInvalidTitle')}>
        <Alert tone="danger">{errorMessage(info.error)}</Alert>
        <Button asChild variant="outline" block className="mt-4">
          <Link to="/login">{t('auth.toLogin')}</Link>
        </Button>
      </AuthCard>
    );
  }

  const invitation = info.data;
  const onSubmit = async (values: InvitationValues) => {
    setFormError(null);
    try {
      const auth = await authApi.acceptInvitation({
        token,
        firstName: accountExists ? null : values.firstName,
        lastName: accountExists ? null : values.lastName,
        password: values.password,
      });
      applyAuth(auth);
      toast.success(t('auth.inviteAccepted', { bakery: invitation.bakeryName }));
      navigate('/admin', { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <AuthCard title={t('auth.inviteTitle')} lead={t('auth.inviteLead', { bakery: invitation.bakeryName, role: t(`roles.${invitation.role}`) })}>
      <div className="mb-4 rounded-lg bg-surface-muted px-3 py-2 text-sm">
        <p className="font-medium">{t('auth.inviteFor', { email: invitation.email })}</p>
        <p className="text-muted-foreground">{t('auth.inviteExpires', { date: formatDateTime(invitation.expiresAt) })}</p>
      </div>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-[0.95rem] text-muted-foreground">{accountExists ? t('auth.inviteExisting') : t('auth.inviteNew')}</p>
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        {!accountExists && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="firstName" label={t('auth.firstName')} required error={errors.firstName?.message}>
              <Input {...fieldAria('firstName', errors.firstName?.message)} autoComplete="given-name" {...register('firstName')} />
            </Field>
            <Field id="lastName" label={t('auth.lastName')} required error={errors.lastName?.message}>
              <Input {...fieldAria('lastName', errors.lastName?.message)} autoComplete="family-name" {...register('lastName')} />
            </Field>
          </div>
        )}
        <Field id="password" label={t('auth.password')} required hint={accountExists ? undefined : t('auth.passwordHint')} error={errors.password?.message}>
          <PasswordInput
            {...fieldAria('password', errors.password?.message, !accountExists)}
            autoComplete={accountExists ? 'current-password' : 'new-password'}
            {...register('password')}
          />
        </Field>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          {t('auth.inviteAccept')}
        </Button>
      </form>
    </AuthCard>
  );
}
