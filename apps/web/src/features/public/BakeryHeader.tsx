import { ChevronDown, Clock, Globe, Mail, MapPin, Phone, Info } from 'lucide-react';
import { useState } from 'react';
import { mediaUrl } from '@/api/client';
import type { PublicBakeryDto, PublicLocationDto } from '@/api/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/controls';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

function initials(name: string) {
  return name
    .replace(/^(Bäckerei|Konditorei|Café|Backstube)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Chooses black or white text for a hex background (WCAG relative luminance). */
export function readableOn(hex: string): '#ffffff' | '#2b211c' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (l + 0.05) >= 4.5 ? '#ffffff' : '#2b211c';
}

export function BakeryHeader({ bakery, location }: { bakery: PublicBakeryDto; location: PublicLocationDto | undefined }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const brand = bakery.brandColor ?? '#B5562B';
  const cover = mediaUrl(bakery.coverImageUrl);
  const logo = mediaUrl(bakery.logoUrl);

  return (
    <header className="border-b border-border bg-surface">
      {cover && !coverFailed ? (
        <div className="h-36 w-full overflow-hidden bg-surface-muted sm:h-52">
          <img src={cover} alt="" className="size-full object-cover" onError={() => setCoverFailed(true)} />
        </div>
      ) : (
        <div className="h-3 w-full" style={{ backgroundColor: brand }} aria-hidden="true" />
      )}
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-5">
        <div className="flex items-start gap-4">
          {logo && !logoFailed ? (
            <img
              src={logo}
              alt=""
              className={cn('size-16 shrink-0 rounded-xl border border-border bg-surface object-contain shadow-soft sm:size-20', cover && !coverFailed && '-mt-12')}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div
              aria-hidden="true"
              className={cn('flex size-16 shrink-0 items-center justify-center rounded-xl font-display text-2xl font-semibold shadow-soft sm:size-20 sm:text-3xl', cover && !coverFailed && '-mt-12')}
              style={{ backgroundColor: brand, color: readableOn(brand) }}
            >
              {initials(bakery.name)}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="font-display text-2xl leading-tight font-semibold sm:text-4xl">{bakery.name}</h1>
            {bakery.description && <p className="max-w-3xl text-[0.95rem] text-muted-foreground sm:text-base">{bakery.description}</p>}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-x-6 gap-y-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
          {location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location.street}, {location.postalCode} {location.city}
            </span>
          )}
          {(location?.phone ?? bakery.contactPhone) && (
            <a className="inline-flex min-h-8 items-center gap-1.5 hover:text-foreground hover:underline" href={`tel:${(location?.phone ?? bakery.contactPhone)!.replace(/[^\d+]/g, '')}`}>
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              {location?.phone ?? bakery.contactPhone}
            </a>
          )}
          {bakery.contactEmail && (
            <a className="inline-flex min-h-8 items-center gap-1.5 hover:text-foreground hover:underline" href={`mailto:${bakery.contactEmail}`}>
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {bakery.contactEmail}
            </a>
          )}
          {bakery.website && (
            <a className="inline-flex min-h-8 items-center gap-1.5 hover:text-foreground hover:underline" href={bakery.website} target="_blank" rel="noopener noreferrer">
              <Globe className="size-4 shrink-0" aria-hidden="true" />
              {t('bakery.website')}
            </a>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
          {location && location.openingHours.length > 0 && (
            <Collapsible className="sm:min-w-72">
              <CollapsibleTrigger className="group inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium hover:underline">
                <Clock className="size-4" aria-hidden="true" />
                {t('bakery.openingHours')}
                <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-background p-3 text-sm">
                  {location.openingHours.map((h) => (
                    <div key={h.dayOfWeek} className="contents">
                      <dt className="font-medium">{t(`days.${h.dayOfWeek}`)}</dt>
                      <dd className="text-muted-foreground">
                        {h.isOpen ? (
                          <>
                            {h.opensAt && h.closesAt ? `${h.opensAt}–${h.closesAt} Uhr` : ''}
                            <span className="block text-xs">{t('bakery.pickupHours', { from: h.pickupStart, to: h.pickupEnd })}</span>
                          </>
                        ) : (
                          t('bakery.closed')
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CollapsibleContent>
            </Collapsible>
          )}
          {bakery.pickupInstructions && (
            <p className="flex items-start gap-2 py-2.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">{t('bakery.pickupInstructions')}: </span>
                {bakery.pickupInstructions}
              </span>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
