import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Logo } from '@/components/common/brand';
import { PublicFooter, SkipLink } from '@/features/public/PublicLayout';

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:py-12">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function AuthCard({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-raised sm:p-7">
      <h1 className="font-display text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
      {lead && <p className="mt-1.5 text-[0.95rem] text-muted-foreground">{lead}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
