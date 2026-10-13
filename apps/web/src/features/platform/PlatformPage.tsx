import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LogOut, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { platformApi } from '@/api/endpoints';
import type { PlatformTenantDto } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/common/brand';
import { CardsSkeleton, EmptyState, ErrorState, ListSkeleton, Pagination } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { Alert, Badge, Card } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { SkipLink } from '@/features/public/PublicLayout';
import { t } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export default function PlatformPage() {
  useDocumentTitle(t('admin.platform.title'));
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<PlatformTenantDto | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const tenantsQ = useQuery({
    queryKey: ['platform', 'tenants', debounced, page],
    queryFn: () => platformApi.tenants(debounced || undefined, page),
    placeholderData: keepPreviousData,
  });
  const healthQ = useQuery({ queryKey: ['platform', 'health'], queryFn: platformApi.health, refetchInterval: 30_000 });

  const setStatus = useMutation({
    mutationFn: ({ tenant, reason }: { tenant: PlatformTenantDto; reason: string }) =>
      tenant.status === 'Active' ? platformApi.suspend(tenant.id, reason || null) : platformApi.reactivate(tenant.id, reason || null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
      toast.success(t('admin.platform.done'));
      setTarget(null);
    },
    onError: (e) => toast.fromError(e),
  });

  const h = healthQ.data;
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Logo to="/platform" />
            <Badge tone="primary">{t('admin.platform.title')}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {(me?.memberships.length ?? 0) > 0 && (
              <Button asChild variant="ghost">
                <Link to="/admin">
                  <ArrowLeft aria-hidden="true" />
                  {t('pages.toDashboard')}
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">{t('auth.logout')}</span>
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <h1 className="font-display text-2xl font-semibold">{t('admin.platform.title')}</h1>
        <Alert tone="info">{t('admin.platform.noCustomerData')}</Alert>

        <section aria-labelledby="health-heading">
          <h2 id="health-heading" className="mb-3 text-lg font-semibold">
            {t('admin.platform.health')}
          </h2>
          {healthQ.isPending ? (
            <CardsSkeleton count={4} />
          ) : healthQ.isError ? (
            <ErrorState compact error={healthQ.error} onRetry={() => void healthQ.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [t('admin.platform.tenantsTotal'), h!.tenants],
                [t('admin.platform.tenantsActive'), h!.activeTenants],
                [t('admin.platform.outboxPending'), h!.pendingOutbox],
                [t('admin.platform.outboxFailed'), h!.failedOutbox],
              ].map(([label, value]) => (
                <Card key={label} className="p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-semibold tabular ${label === t('admin.platform.outboxFailed') && Number(value) > 0 ? 'text-danger' : ''}`}>{value}</p>
                </Card>
              ))}
            </div>
          )}
          {h?.oldestPendingOutbox && <p className="mt-2 text-sm text-muted-foreground">{t('admin.platform.oldestPending', { date: formatDateTime(h.oldestPendingOutbox) })}</p>}
        </section>

        <section aria-labelledby="tenants-heading" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="tenants-heading" className="text-lg font-semibold">
              {t('admin.platform.tenants')}
            </h2>
            <div className="sm:w-80">
              <Label htmlFor="tenant-search" className="sr-only">
                {t('admin.platform.search')}
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="tenant-search" type="search" className="pl-9" placeholder={t('admin.platform.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
          {tenantsQ.isPending ? (
            <ListSkeleton rows={4} />
          ) : tenantsQ.isError ? (
            <ErrorState error={tenantsQ.error} onRetry={() => void tenantsQ.refetch()} />
          ) : tenantsQ.data.items.length === 0 ? (
            <EmptyState title={t('admin.platform.empty')} />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
                {tenantsQ.data.items.map((tenant) => (
                  <li key={tenant.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{tenant.name}</p>
                      <p className="text-sm text-muted-foreground">
                        /b/{tenant.slug} · {t('admin.platform.locations')}: {tenant.locations} · {t('admin.platform.created')}: {formatDateTime(tenant.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tenant.status === 'Active' ? 'success' : 'danger'}>{t(`tenantStatus.${tenant.status}`)}</Badge>
                      {tenant.planCode && (
                        <Badge tone="neutral">
                          {tenant.planCode}
                          {tenant.subscriptionStatus ? ` · ${t(`subscriptionStatus.${tenant.subscriptionStatus}`)}` : ''}
                        </Badge>
                      )}
                      {tenant.isPublished && <Badge tone="info">{t('admin.platform.published')}</Badge>}
                      <Button size="sm" variant={tenant.status === 'Active' ? 'outline' : 'primary'} onClick={() => setTarget(tenant)}>
                        {tenant.status === 'Active' ? t('admin.platform.suspend') : t('admin.platform.reactivate')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={tenantsQ.data.page} pageSize={tenantsQ.data.pageSize} total={tenantsQ.data.totalCount} onPage={setPage} />
            </>
          )}
        </section>
      </main>
      {target && <StatusDialog tenant={target} busy={setStatus.isPending} onClose={() => setTarget(null)} onConfirm={(reason) => setStatus.mutate({ tenant: target, reason })} />}
    </div>
  );
}

function StatusDialog({ tenant, busy, onClose, onConfirm }: { tenant: PlatformTenantDto; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const suspend = tenant.status === 'Active';
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{suspend ? t('admin.platform.suspendTitle', { name: tenant.name }) : t('admin.platform.reactivateTitle', { name: tenant.name })}</DialogTitle>
          <DialogDescription>/b/{tenant.slug}</DialogDescription>
        </DialogHeader>
        <Field id="tenant-reason" label={t('admin.platform.reason')} optional>
          <Textarea id="tenant-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            {t('app.cancel')}
          </Button>
          <Button variant={suspend ? 'danger' : 'primary'} size="lg" loading={busy} onClick={() => onConfirm(reason.trim())}>
            {suspend ? t('admin.platform.suspend') : t('admin.platform.reactivate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
