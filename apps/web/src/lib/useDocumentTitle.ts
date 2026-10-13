import { useEffect } from 'react';
import { t } from '@/i18n';

/** Sets document.title ("… · BackReserve") for screen readers and browser history. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${t('app.name')}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
