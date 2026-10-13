import { TriangleAlert } from 'lucide-react';
import { t, type TranslationKey } from '@/i18n';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

function LegalPage({ title, paragraphs }: { title: TranslationKey; paragraphs: TranslationKey[] }) {
  useDocumentTitle(t(title));
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-semibold">{t(title)}</h1>
      <p className="mt-4 flex gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[0.95rem]" role="note">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <strong className="font-semibold">{t('legal.placeholderNotice')}</strong>
      </p>
      <div className="mt-6 space-y-4 text-[1.02rem] leading-relaxed">
        {paragraphs.map((p) => (
          <p key={p}>{t(p)}</p>
        ))}
      </div>
    </article>
  );
}

export function PrivacyPage() {
  return <LegalPage title="legal.privacyTitle" paragraphs={['legal.privacyBody1', 'legal.privacyBody2', 'legal.privacyBody3']} />;
}

export function TermsPage() {
  return <LegalPage title="legal.termsTitle" paragraphs={['legal.termsBody1', 'legal.termsBody2', 'legal.termsBody3']} />;
}
