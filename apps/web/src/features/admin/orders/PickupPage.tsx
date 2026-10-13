import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, ExternalLink, MessageSquareWarning, QrCode, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { isApiError } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { OrderDetailDto } from '@/api/types';
import { OrderStatusBadge } from '@/components/common/status';
import { PageHeader } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Alert, Card } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { formatDateLong, formatTimeRange, todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { extractPickupCode, formatPickupCodeInput, normalizePickupCode } from '@/lib/pickupCode';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAdmin } from '../AdminContext';
import { ReportProblemDialog, useOrderAction } from './orderActions';

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' && !!navigator.mediaDevices?.getUserMedia ? ctor : null;
}

export default function PickupPage() {
  useDocumentTitle(t('admin.pickup.title'));
  const { key, can } = useAdmin();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [lastCollected, setLastCollected] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const run = useOrderAction();

  const lookup = useMutation<OrderDetailDto, unknown, string>({
    mutationFn: (value) => adminApi.lookup(value),
    onSuccess: (order) => {
      queryClient.setQueryData(key('order', order.id), order);
      setCurrentId(order.id);
    },
    onError: () => setCurrentId(null),
  });

  const search = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setInputError(t('validation.codeRequired'));
      inputRef.current?.focus();
      return;
    }
    setInputError(null);
    setLastCollected(null);
    lookup.mutate(normalizePickupCode(trimmed));
  };

  // Mutations (status change, problem report) update the cached order, so the view stays current.
  const orderQ = useQuery({
    queryKey: key('order', currentId),
    queryFn: () => adminApi.order(currentId!),
    enabled: !!currentId,
    staleTime: 5_000,
  });
  const shown = currentId ? (orderQ.data ?? null) : null;

  const collect = async (o: OrderDetailDto) => {
    await run.mutateAsync({ id: o.id, action: 'collect' });
    setLastCollected(o.publicReference);
    toast.success(t('admin.pickup.collected', { code: o.publicReference }));
    setCurrentId(null);
    lookup.reset();
    setCode('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const today = todayIso();
  const notFound = lookup.isError && isApiError(lookup.error) && lookup.error.isNotFound;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('admin.pickup.title')} description={t('admin.pickup.lead')} />

      <Card className="p-4 sm:p-5">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            search(code);
          }}
          className="space-y-3"
        >
          <Label htmlFor="pickup-code" className="text-base">
            {t('admin.pickup.codeLabel')}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              id="pickup-code"
              value={code}
              onChange={(e) => {
                setCode(formatPickupCodeInput(e.target.value));
                setInputError(null);
              }}
              placeholder={t('admin.pickup.codePlaceholder')}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? 'pickup-code-error' : 'pickup-code-hint'}
              className="h-16 font-mono text-3xl font-bold tracking-[0.15em] uppercase placeholder:font-sans placeholder:text-xl placeholder:font-normal placeholder:tracking-normal placeholder:normal-case sm:flex-1"
            />
            <Button type="submit" size="xl" loading={lookup.isPending} className="sm:w-40">
              <Search aria-hidden="true" />
              {t('admin.pickup.search')}
            </Button>
          </div>
          {inputError ? (
            <p id="pickup-code-error" className="text-sm font-medium text-danger" role="alert">
              {inputError}
            </p>
          ) : (
            <p id="pickup-code-hint" className="text-sm text-muted-foreground">
              {t('admin.pickup.codeHint')}
            </p>
          )}
          <Button variant="outline" size="lg" onClick={() => setScanOpen(true)}>
            <QrCode aria-hidden="true" />
            {t('admin.pickup.scan')}
          </Button>
        </form>
      </Card>

      <div className="mt-4 space-y-4" aria-live="polite">
        {lastCollected && !shown && (
          <Alert tone="success" title={t('admin.pickup.collected', { code: lastCollected })}>
            {t('admin.pickup.nextCustomer')}
          </Alert>
        )}
        {notFound && (
          <Alert tone="danger" title={t('admin.pickup.notFound')}>
            {normalizePickupCode(lookup.variables ?? '')}
          </Alert>
        )}
        {lookup.isError && !notFound && <Alert tone="danger">{isApiError(lookup.error) ? lookup.error.title : t('errors.unexpected')}</Alert>}
        {shown && <PickupResult order={shown} today={today} canCollect={can('PickupCollect')} canReport={can('PickupCollect') || can('OrdersProcess')} onCollect={collect} />}
      </div>

      {scanOpen && (
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onCode={(value) => {
          setScanOpen(false);
          setCode(value);
          search(value);
        }}
      />
      )}
    </div>
  );
}

function PickupResult({
  order,
  today,
  canCollect,
  canReport,
  onCollect,
}: {
  order: OrderDetailDto;
  today: string;
  canCollect: boolean;
  canReport: boolean;
  onCollect: (o: OrderDetailDto) => Promise<void>;
}) {
  const warnings: string[] = [];
  if (order.status === 'Cancelled') warnings.push(t('admin.pickup.warningCancelled'));
  if (order.status === 'Collected') warnings.push(t('admin.pickup.warningCollected'));
  if (order.status === 'NoShow') warnings.push(t('admin.pickup.warningNoShow'));
  if (order.pickupDate !== today && order.status !== 'Collected' && order.status !== 'Cancelled')
    warnings.push(t('admin.pickup.warningOtherDay', { date: formatDateLong(order.pickupDate) }));
  const collectable = order.allowedActions.includes('collect');
  const total = formatMoney(order.total, order.currency);

  return (
    <Card className="overflow-hidden" data-testid="pickup-result">
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-lg font-bold tracking-widest text-muted-foreground">{order.publicReference}</p>
            <p className="text-3xl leading-tight font-semibold sm:text-4xl">{order.customerName}</p>
          </div>
          <OrderStatusBadge status={order.status} size="lg" />
        </div>
        <p className="flex items-center gap-2 text-lg">
          <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" />
          {formatDateLong(order.pickupDate)}, {formatTimeRange(order.slotStart, order.slotEnd)}
        </p>
        {warnings.map((w) => (
          <div key={w} className="flex items-start gap-3 rounded-lg border-2 border-danger/40 bg-danger-soft px-4 py-3 text-lg font-semibold text-danger-strong" role="alert">
            <TriangleAlert className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            {w}
          </div>
        ))}
        {order.customerNote && <Alert tone="info">{order.customerNote}</Alert>}
      </div>
      <ul className="divide-y divide-border border-y border-border bg-background/50">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-baseline gap-4 px-5 py-3">
            <span className="w-14 shrink-0 text-right text-3xl font-bold tabular">{item.quantity}×</span>
            <span className="text-xl">{item.productName}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3 px-5 py-4">
        <span className="text-lg">{t('admin.pickup.toPay')}</span>
        <span className="text-3xl font-bold tabular">{total}</span>
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:flex-wrap">
        {canCollect && collectable && (
          <ConfirmDialog
            trigger={
              <Button size="xl" variant="success" className="sm:flex-1">
                <CheckCircle2 aria-hidden="true" />
                {t('admin.pickup.collect')}
              </Button>
            }
            title={t('admin.pickup.collectConfirmTitle')}
            description={t('admin.pickup.collectConfirmText', { total })}
            confirmLabel={t('admin.pickup.collect')}
            variant="success"
            onConfirm={() => onCollect(order)}
          />
        )}
        {!canCollect && collectable && <Alert tone="info">{t('admin.pickup.noPermission')}</Alert>}
        {canReport && (
          <ReportProblemDialog
            orderId={order.id}
            trigger={(open) => (
              <Button variant="outline" size="xl" onClick={open}>
                <MessageSquareWarning aria-hidden="true" />
                {t('admin.orders.reportProblem')}
              </Button>
            )}
          />
        )}
        <Button asChild variant="ghost" size="xl">
          <Link to={`/admin/bestellungen/${order.id}`}>
            <ExternalLink aria-hidden="true" />
            {t('admin.pickup.openDetails')}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** Camera QR scanning via the native BarcodeDetector API (feature-detected; manual entry always works). */
function ScanDialog({ open, onOpenChange, onCode }: { open: boolean; onOpenChange: (open: boolean) => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const Detector = getBarcodeDetector();

  useEffect(() => {
    if (!open || !Detector) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const detector = new Detector({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (cancelled) return;
          try {
            const results = await detector.detect(video);
            const found = results.map((r) => extractPickupCode(r.rawValue)).find(Boolean);
            if (found) {
              onCode(found);
              return;
            }
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      } catch {
        setError(t('admin.pickup.scanDenied'));
      }
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, Detector, onCode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.pickup.scanTitle')}</DialogTitle>
          <DialogDescription>{Detector ? t('admin.pickup.scanHint') : t('admin.pickup.scanUnsupported')}</DialogDescription>
        </DialogHeader>
        {Detector && !error && <video ref={videoRef} className="aspect-square w-full rounded-lg bg-foreground object-cover" muted playsInline />}
        {error && <Alert tone="warning">{error}</Alert>}
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          {t('app.close')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
