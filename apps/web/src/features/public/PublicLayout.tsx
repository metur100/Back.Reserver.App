import { ClipboardList } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { Logo } from '@/components/common/brand';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-md bg-foreground px-4 py-2 text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {t('app.skipToContent')}
    </a>
  );
}

export function PublicFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border bg-surface-muted/60', className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t('landing.footer', { year: String(new Date().getFullYear()) })}</p>
        <nav aria-label={t('legal.terms')} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="inline-flex min-h-11 items-center hover:text-foreground hover:underline sm:min-h-0" to="/meine-bestellungen">
            {t('landing.myOrders')}
          </Link>
          <Link className="inline-flex min-h-11 items-center hover:text-foreground hover:underline sm:min-h-0" to="/datenschutz">
            {t('legal.privacy')}
          </Link>
          <Link className="inline-flex min-h-11 items-center hover:text-foreground hover:underline sm:min-h-0" to="/agb">
            {t('legal.terms')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** Simple chrome for landing, legal, order and "my orders" pages. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <nav className="flex items-center gap-1" aria-label={t('admin.nav.main')}>
            <NavLink
              to="/meine-bestellungen"
              className={({ isActive }) =>
                cn('inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-surface-muted', isActive && 'bg-surface-muted')
              }
            >
              <ClipboardList className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('landing.myOrders')}</span>
              <span className="sr-only sm:hidden">{t('landing.myOrders')}</span>
            </NavLink>
            <Link to="/login" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-surface-muted">
              {t('landing.ctaLogin')}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
