import { ArrowRight, Leaf, ShieldCheck, Store, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function LandingPage() {
  useDocumentTitle(t('app.tagline'));
  const features = [
    { icon: Leaf, title: t('landing.feature1Title'), text: t('landing.feature1Text') },
    { icon: Store, title: t('landing.feature2Title'), text: t('landing.feature2Text') },
    { icon: Wallet, title: t('landing.feature3Title'), text: t('landing.feature3Text') },
  ];
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-14 sm:pt-20 sm:pb-20">
        <div className="max-w-3xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-success" aria-hidden="true" />
            {t('checkout.paymentText')}
          </p>
          <h1 className="font-display text-4xl leading-[1.08] font-semibold sm:text-6xl">{t('landing.title')}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{t('landing.lead')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/registrieren">
                {t('landing.ctaRegister')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/b/baeckerei-rheinblick">{t('landing.ctaDemo')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="space-y-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-strong" aria-hidden="true">
                <Icon className="size-5" />
              </div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t('landing.howTitle')}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[t('landing.how1'), t('landing.how2'), t('landing.how3')].map((step, i) => (
            <li key={step} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background tabular">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
