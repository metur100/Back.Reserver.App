import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Building2,
  ChefHat,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  ScanLine,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { adminApi } from '@/api/endpoints';
import type { Permission } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { LogoMark } from '@/components/common/brand';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/menu';
import { Alert } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { SkipLink } from '@/features/public/PublicLayout';
import { t } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AdminProvider, useAdmin } from './AdminContext';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  any: Permission[];
  end?: boolean;
}

export function navItems(): NavItem[] {
  return [
    { to: '/admin', label: t('admin.nav.dashboard'), icon: LayoutDashboard, any: ['OrdersView'], end: true },
    { to: '/admin/bestellungen', label: t('admin.nav.orders'), icon: ClipboardList, any: ['OrdersView'] },
    { to: '/admin/abholung', label: t('admin.nav.pickup'), icon: ScanLine, any: ['OrdersView'] },
    { to: '/admin/produkte', label: t('admin.nav.products'), icon: Package, any: ['ProductsManage'] },
    { to: '/admin/produktion', label: t('admin.nav.production'), icon: ChefHat, any: ['InventoryManage', 'OrdersView'] },
    { to: '/admin/standorte', label: t('admin.nav.locations'), icon: MapPin, any: ['LocationsManage', 'PickupScheduleManage'] },
    { to: '/admin/mitarbeiter', label: t('admin.nav.staff'), icon: Users, any: ['StaffManage'] },
    { to: '/admin/auswertungen', label: t('admin.nav.reports'), icon: BarChart3, any: ['ReportsView'] },
    { to: '/admin/einstellungen', label: t('admin.nav.settings'), icon: Settings, any: ['SettingsManage', 'SubscriptionManage'] },
  ];
}

/** Entry for /admin: resolves the membership and provides the admin context. */
export function AdminRoot() {
  const { me, membership } = useAuth();
  if (!me) return null;
  if (!membership) {
    if (me.isPlatformAdmin) return <Navigate to="/platform" replace />;
    return <NoMembership />;
  }
  return (
    <AdminProvider key={membership.tenantId} membership={membership}>
      <AdminShell />
    </AdminProvider>
  );
}

function NoMembership() {
  const { logout } = useAuth();
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon={<Building2 className="size-6" />}
        title={t('auth.noMembershipTitle')}
        description={t('auth.noMembershipText')}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link to="/registrieren">{t('auth.registerLink')}</Link>
            </Button>
            <Button variant="outline" onClick={() => void logout()}>
              {t('auth.logout')}
            </Button>
          </div>
        }
      />
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAdmin();
  const { me } = useAuth();
  const items = navItems().filter((i) => i.any.some(can));
  return (
    <ul className="space-y-0.5">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium transition-colors',
                isActive ? 'bg-foreground text-background' : 'text-foreground hover:bg-surface-muted',
              )
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
      {me?.isPlatformAdmin && (
        <li>
          <NavLink
            to="/platform"
            onClick={onNavigate}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium hover:bg-surface-muted"
          >
            <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
            {t('admin.nav.platform')}
          </NavLink>
        </li>
      )}
    </ul>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { membership } = useAdmin();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link to="/admin" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-2 py-2">
        <LogoMark />
        <span className="min-w-0">
          <span className="block font-display text-[1.05rem] leading-tight font-semibold">{t('app.name')}</span>
          <span className="block truncate text-xs text-muted-foreground">{membership.tenantName}</span>
        </span>
      </Link>
      <nav aria-label={t('admin.nav.main')} className="flex-1 overflow-y-auto">
        <NavList onNavigate={onNavigate} />
      </nav>
      <a
        href={`${import.meta.env.BASE_URL}b/${membership.tenantSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        {t('admin.nav.publicPage')}
      </a>
    </div>
  );
}

function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isReadOnly, can } = useAdmin();
  const location = useLocation();
  const bottomItems = navItems()
    .filter((i) => i.any.some(can))
    .filter((i) => ['/admin', '/admin/bestellungen', '/admin/abholung', '/admin/produktion'].includes(i.to))
    .slice(0, 4);

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink />
      <aside className="no-print sticky top-0 hidden h-dvh border-r border-border bg-surface lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        {isReadOnly && (
          <div className="no-print px-4 pt-3 sm:px-6">
            <Alert tone="warning">{t('admin.topbar.readOnly')}</Alert>
          </div>
        )}
        <main id="main" className="print-area flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-10" key={location.pathname.split('/')[2] ?? 'root'}>
          <Outlet />
        </main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <h2 className="sr-only">{t('admin.nav.menu')}</h2>
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <nav
        aria-label={t('admin.nav.menu')}
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${bottomItems.length + 1}, minmax(0, 1fr))` }}>
          {bottomItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium', isActive ? 'text-primary-strong' : 'text-muted-foreground')
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted-foreground">
              <Menu className="size-5" aria-hidden="true" />
              {t('admin.nav.menu')}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { me, logout, selectTenant } = useAuth();
  const { membership, locations, selectedLocationId, setSelectedLocationId, isOwner } = useAdmin();
  const navigate = useNavigate();
  const memberships = me?.memberships ?? [];
  const showLocation = locations.length > 1 || (isOwner && locations.length > 1);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label={t('admin.nav.openMenu')}>
          <Menu aria-hidden="true" />
        </Button>

        {memberships.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="max-w-[45vw] min-w-0 px-2 sm:max-w-xs" aria-label={`${t('admin.topbar.switchBakery')}: ${membership.tenantName}`}>
                <Building2 aria-hidden="true" />
                <span className="truncate">{membership.tenantName}</span>
                <ChevronDown className="opacity-60" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t('admin.topbar.switchBakery')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={membership.tenantId}
                onValueChange={(id) => {
                  selectTenant(id);
                  navigate('/admin');
                }}
              >
                {memberships.map((m) => (
                  <DropdownMenuRadioItem key={m.tenantId} value={m.tenantId}>
                    {m.tenantName}
                    {m.tenantStatus === 'Suspended' && <span className="text-xs text-danger"> · {t('admin.topbar.suspended')}</span>}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="truncate px-2 font-medium lg:hidden">{membership.tenantName}</span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {showLocation && (
            <div className="hidden sm:block">
              <label htmlFor="topbar-location" className="sr-only">
                {t('admin.topbar.location')}
              </label>
              <NativeSelect id="topbar-location" className="h-10 w-52 text-sm" value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)}>
                {isOwner && <option value="">{t('admin.topbar.allLocations')}</option>}
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('admin.topbar.userMenu')} className="rounded-full">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-strong" aria-hidden="true">
                  {(me?.firstName[0] ?? '') + (me?.lastName[0] ?? '')}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2.5 py-2">
                <p className="font-medium">
                  {me?.firstName} {me?.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{me?.email}</p>
                <p className="text-xs text-muted-foreground">{t(`roles.${membership.role}`)}</p>
              </div>
              {showLocation && (
                <div className="px-2.5 pb-2 sm:hidden">
                  <label htmlFor="menu-location" className="text-xs font-medium text-muted-foreground">
                    {t('admin.topbar.location')}
                  </label>
                  <NativeSelect id="menu-location" className="mt-1 h-10 text-sm" value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)}>
                    {isOwner && <option value="">{t('admin.topbar.allLocations')}</option>}
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  await logout();
                  toast.info(t('auth.loggedOut'));
                  navigate('/login', { replace: true });
                }}
              >
                <LogOut aria-hidden="true" />
                {t('auth.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function NotificationsBell() {
  const { key, can } = useAdmin();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notificationsQ = useQuery({
    queryKey: key('notifications'),
    queryFn: () => adminApi.notifications(false),
    enabled: can('OrdersView'),
    refetchInterval: 30_000,
  });
  const readAll = useMutation({
    mutationFn: adminApi.readAllNotifications,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key('notifications') });
      void queryClient.invalidateQueries({ queryKey: key('dashboard') });
    },
    onError: (e) => toast.fromError(e),
  });
  if (!can('OrdersView')) return null;
  const items = notificationsQ.data ?? [];
  const unread = items.filter((n) => !n.isRead).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`${t('admin.topbar.notifications')}${unread ? `, ${t('admin.topbar.notificationsUnread', { count: unread })}` : ''}`}
        >
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.7rem] font-bold text-primary-foreground" aria-hidden="true">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="font-semibold">{t('admin.topbar.notifications')}</p>
          {unread > 0 && (
            <Button variant="link" size="sm" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
              {t('admin.topbar.markAllRead')}
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('admin.topbar.noNotifications')}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-surface-muted"
                  onClick={() => {
                    setOpen(false);
                    if (n.orderId) navigate(`/admin/bestellungen/${n.orderId}`);
                  }}
                >
                  <span className={cn('text-sm', !n.isRead && 'font-semibold')}>
                    {!n.isRead && <span className="mr-1.5 inline-block size-2 rounded-full bg-primary" aria-hidden="true" />}
                    {n.message}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
