import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Pencil, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { LocationDto, MembershipRole, Permission, StaffMemberDto } from '@/api/types';
import { roleCeiling, roleDefault } from '@/auth/permissions';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, fieldAria, Input, NativeSelect } from '@/components/ui/input';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { EMAIL_REGEX } from '@/features/public/checkoutSchema';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAdmin } from '../AdminContext';

export default function StaffPage() {
  useDocumentTitle(t('admin.staff.title'));
  const { key, locations } = useAdmin();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMemberDto | null>(null);
  const staffQ = useQuery({ queryKey: key('staff'), queryFn: adminApi.staff });
  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeInvitation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key('staff') });
      toast.success(t('admin.staff.revoked'));
    },
    onError: (e) => toast.fromError(e),
  });

  const data = staffQ.data;
  const activeMembers = data?.members.filter((m) => m.isActive).length ?? 0;
  const pending = data?.invitations.filter((i) => i.status === 'pending').length ?? 0;
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '–';

  return (
    <div>
      <PageHeader
        title={t('admin.staff.title')}
        description={data ? t('admin.staff.usage', { used: activeMembers + pending, max: data.maxStaff }) : undefined}
        actions={
          <Button onClick={() => setInviteOpen(true)} disabled={locations.length === 0}>
            <UserPlus aria-hidden="true" />
            {t('admin.staff.invite')}
          </Button>
        }
      />
      {staffQ.isPending ? (
        <ListSkeleton rows={3} />
      ) : staffQ.isError ? (
        <ErrorState error={staffQ.error} onRetry={() => void staffQ.refetch()} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.staff.members')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <ul className="divide-y divide-border">
                {data!.members.map((m) => (
                  <li key={m.membershipId} className="flex flex-wrap items-center gap-3 py-3" data-testid="staff-member">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {m.firstName} {m.lastName}
                        {m.isCurrentUser && <span className="ml-2 text-sm font-normal text-muted-foreground">({t('admin.staff.you')})</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{m.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.locationIds === null ? t('admin.staff.allLocations') : m.locationIds.map(locationName).join(', ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={m.role === 'Owner' ? 'primary' : 'neutral'}>{t(`roles.${m.role}`)}</Badge>
                      <Badge tone={m.isActive ? 'success' : 'neutral'}>{m.isActive ? t('admin.staff.active') : t('admin.staff.inactive')}</Badge>
                      {m.role !== 'Owner' && !m.isCurrentUser && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(m)} aria-label={`${t('app.edit')}: ${m.firstName} ${m.lastName}`}>
                          <Pencil aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.staff.invitations')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {data!.invitations.length === 0 ? (
                <EmptyState icon={<MailPlus className="size-6" />} title={t('admin.staff.invitationsEmpty')} className="py-6" />
              ) : (
                <ul className="divide-y divide-border">
                  {data!.invitations.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-all">{inv.email}</p>
                        <p className="text-sm text-muted-foreground">
                          {t(`roles.${inv.role}`)} · {inv.locationIds.map(locationName).join(', ')} ·{' '}
                          {inv.status === 'expired' ? t('admin.staff.expired') : t('admin.staff.expires', { date: formatDateTime(inv.expiresAt) })}
                        </p>
                      </div>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            <X aria-hidden="true" />
                            {t('admin.staff.revoke')}
                          </Button>
                        }
                        title={t('admin.staff.revokeTitle')}
                        description={inv.email}
                        confirmLabel={t('admin.staff.revoke')}
                        variant="danger"
                        onConfirm={() => revoke.mutateAsync(inv.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} locations={locations} />
      {editing && <EditMemberDialog member={editing} locations={locations} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PermissionPicker({ role, value, onChange }: { role: MembershipRole; value: Permission[]; onChange: (p: Permission[]) => void }) {
  const ceiling = roleCeiling(role);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('admin.staff.permissions')}</legend>
      <p className="text-sm text-muted-foreground">{t('admin.staff.permissionsHint')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ceiling.map((p) => (
          <label key={p} className="flex min-h-10 items-center gap-2.5 rounded-md border border-border px-3 py-2">
            <Checkbox checked={value.includes(p)} onCheckedChange={(v) => onChange(v === true ? [...value, p] : value.filter((x) => x !== p))} />
            <span className="text-sm">{t(`permissions.${p}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LocationPicker({ locations, value, onChange, error }: { locations: LocationDto[]; value: string[]; onChange: (ids: string[]) => void; error?: string }) {
  return (
    <fieldset className="space-y-2" aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium">
        {t('admin.staff.locations')} <span className="text-danger">*</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {locations.map((l) => (
          <label key={l.id} className="flex min-h-10 items-center gap-2.5 rounded-md border border-border px-3 py-2">
            <Checkbox checked={value.includes(l.id)} onCheckedChange={(v) => onChange(v === true ? [...value, l.id] : value.filter((x) => x !== l.id))} />
            <span className="text-sm">{l.name}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function InviteDialog({ open, onOpenChange, locations }: { open: boolean; onOpenChange: (open: boolean) => void; locations: LocationDto[] }) {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('Staff');
  const [locationIds, setLocationIds] = useState<string[]>(() => (locations.length === 1 ? [locations[0]!.id] : []));
  const [custom, setCustom] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>(roleDefault('Staff'));
  const [errors, setErrors] = useState<{ email?: string; locations?: string; form?: string }>({});

  const invite = useMutation({
    mutationFn: () =>
      adminApi.invite({
        email: email.trim(),
        role,
        locationIds: locationIds.length ? locationIds : locations.length === 1 ? [locations[0]!.id] : [],
        permissions: custom ? permissions : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key('staff') });
      toast.success(t('admin.staff.invited', { email: email.trim() }));
      setEmail('');
      setErrors({});
      onOpenChange(false);
    },
    onError: (e) => setErrors({ form: errorMessage(e) }),
  });

  const submit = () => {
    const next: typeof errors = {};
    if (!EMAIL_REGEX.test(email.trim())) next.email = t('validation.adminEmail');
    const effectiveLocations = locationIds.length ? locationIds : locations.length === 1 ? [locations[0]!.id] : [];
    if (effectiveLocations.length === 0) next.locations = t('validation.locationsRequired');
    setErrors(next);
    if (Object.keys(next).length === 0) invite.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('admin.staff.inviteTitle')}</DialogTitle>
          <DialogDescription>{t('admin.staff.inviteText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {errors.form && (
            <Alert tone="danger" live>
              {errors.form}
            </Alert>
          )}
          <Field id="invite-email" label={t('admin.staff.email')} required error={errors.email}>
            <Input {...fieldAria('invite-email', errors.email)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="invite-role" label={t('admin.staff.role')}>
            <NativeSelect
              id="invite-role"
              value={role}
              onChange={(e) => {
                const r = e.target.value as MembershipRole;
                setRole(r);
                setPermissions(roleDefault(r));
              }}
            >
              <option value="Staff">{t('roles.Staff')}</option>
              <option value="Manager">{t('roles.Manager')}</option>
            </NativeSelect>
          </Field>
          {locations.length > 1 && <LocationPicker locations={locations} value={locationIds} onChange={setLocationIds} error={errors.locations} />}
          <label className="flex items-center gap-3">
            <Switch checked={custom} onCheckedChange={setCustom} />
            <span className="font-medium">{t('admin.staff.customPermissions')}</span>
          </label>
          {custom && <PermissionPicker role={role} value={permissions} onChange={setPermissions} />}
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              {t('app.cancel')}
            </Button>
            <Button type="submit" size="lg" loading={invite.isPending}>
              {t('admin.staff.inviteSend')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, locations, onClose }: { member: StaffMemberDto; locations: LocationDto[]; onClose: () => void }) {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<MembershipRole>(member.role === 'Owner' ? 'Manager' : member.role);
  const [locationIds, setLocationIds] = useState<string[]>(member.locationIds ?? []);
  const [permissions, setPermissions] = useState<Permission[]>(member.permissions);
  const [isActive, setIsActive] = useState(member.isActive);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => adminApi.updateMembership(member.membershipId, { role, locationIds, permissions: permissions.length ? permissions : null, isActive }),
    onSuccess: (overview) => {
      queryClient.setQueryData(key('staff'), overview);
      toast.success(t('admin.staff.saved'));
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('admin.staff.editTitle')}</DialogTitle>
          <DialogDescription>
            {member.firstName} {member.lastName} · {member.email}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (locationIds.length === 0) {
              setError(t('validation.locationsRequired'));
              return;
            }
            save.mutate();
          }}
        >
          {error && (
            <Alert tone="danger" live>
              {error}
            </Alert>
          )}
          <Field id="edit-role" label={t('admin.staff.role')}>
            <NativeSelect
              id="edit-role"
              value={role}
              onChange={(e) => {
                const r = e.target.value as MembershipRole;
                setRole(r);
                setPermissions(roleDefault(r));
              }}
            >
              <option value="Staff">{t('roles.Staff')}</option>
              <option value="Manager">{t('roles.Manager')}</option>
            </NativeSelect>
          </Field>
          <LocationPicker locations={locations} value={locationIds} onChange={setLocationIds} />
          <PermissionPicker role={role} value={permissions.filter((p) => roleCeiling(role).includes(p))} onChange={setPermissions} />
          <label className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="font-medium">{t('admin.staff.membershipActive')}</span>
          </label>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={onClose}>
              {t('app.cancel')}
            </Button>
            <Button type="submit" size="lg" loading={save.isPending}>
              {t('app.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
