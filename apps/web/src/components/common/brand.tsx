import { Link } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--color-primary)" />
      <path d="M14 40c0-10 8-18 18-18s18 8 18 18v4H14z" fill="var(--color-background)" />
      <path d="M24 30c2 3 2 7 0 10M32 27c2 4 2 9 0 13M40 30c2 3 2 7 0 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-md font-display text-lg font-semibold tracking-tight', className)}>
      <LogoMark />
      <span>{t('app.name')}</span>
    </Link>
  );
}
