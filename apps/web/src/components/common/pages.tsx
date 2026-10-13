import { Compass, Lock, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

function Centered({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-muted text-muted-foreground" aria-hidden="true">
        {icon}
      </div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

export function NotFoundPage({ homeHref = '/' }: { homeHref?: string }) {
  useDocumentTitle(t('pages.notFoundTitle'));
  return (
    <Centered
      icon={<Compass className="size-7" />}
      title={t('pages.notFoundTitle')}
      text={t('pages.notFoundText')}
      action={
        <Button asChild variant="outline">
          <Link to={homeHref}>{homeHref === '/' ? t('pages.toHome') : t('pages.toDashboard')}</Link>
        </Button>
      }
    />
  );
}

export function ForbiddenPage() {
  useDocumentTitle(t('pages.forbiddenTitle'));
  return (
    <Centered
      icon={<Lock className="size-7" />}
      title={t('pages.forbiddenTitle')}
      text={t('pages.forbiddenText')}
      action={
        <Button asChild variant="outline">
          <Link to="/admin">{t('pages.toDashboard')}</Link>
        </Button>
      }
    />
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  return (
    <Centered
      icon={<TriangleAlert className="size-7" />}
      title={t('pages.errorTitle')}
      text={t('pages.errorText')}
      action={<Button onClick={() => window.location.reload()}>{t('app.reload')}</Button>}
    />
  );
}
