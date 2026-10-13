import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Ban, MessageSquareWarning, PackageCheck, CheckCheck, ChefHat, UserX, StickyNote, CircleDot } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { isApiError } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { OrderAction, OrderDetailDto, OrderHistoryDto, OrderStatus } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, fieldAria, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { orderActionLabel, orderStatusLabel } from '@/lib/orderStatus';
import { cn } from '@/lib/utils';
import { useAdmin } from '../AdminContext';

export interface RunActionInput {
  id: string;
  action: OrderAction;
  reason?: string;
}

/** Status transitions with cache updates, success toasts and 409 handling (refresh on conflict). */
export function useOrderAction() {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  return useMutation<OrderDetailDto, unknown, RunActionInput>({
    mutationFn: ({ id, action, reason }) => (action === 'cancel' ? adminApi.cancelOrder(id, reason ?? '') : adminApi.orderAction(id, action)),
    onSuccess: (order) => {
      queryClient.setQueryData(key('order', order.id), order);
      void queryClient.invalidateQueries({ queryKey: key('orders') });
      void queryClient.invalidateQueries({ queryKey: key('dashboard') });
      toast.success(t('admin.orders.statusChanged', { status: orderStatusLabel(order.status) }));
    },
    onError: (error, vars) => {
      toast.fromError(error);
      if (isApiError(error) && (error.isConflict || error.isNotFound)) {
        void queryClient.invalidateQueries({ queryKey: key('order', vars.id) });
        void queryClient.invalidateQueries({ queryKey: key('orders') });
      }
    },
  });
}

export function useReportProblem() {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  return useMutation<OrderDetailDto, unknown, { id: string; note: string }>({
    mutationFn: ({ id, note }) => adminApi.reportProblem(id, note),
    onSuccess: (order) => {
      queryClient.setQueryData(key('order', order.id), order);
      void queryClient.invalidateQueries({ queryKey: key('notifications') });
      toast.success(t('admin.orders.problemReported'));
    },
    onError: (error) => toast.fromError(error),
  });
}

const actionIcons: Record<OrderAction, typeof ChefHat> = {
  prepare: ChefHat,
  ready: PackageCheck,
  collect: CheckCheck,
  cancel: Ban,
  'no-show': UserX,
};

export function ActionIcon({ action, className }: { action: OrderAction; className?: string }) {
  const Icon = actionIcons[action];
  return <Icon className={className} aria-hidden="true" />;
}

/** Dialog asking for a cancellation reason (required by the server; the customer is informed). */
export function CancelOrderDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) {
      setError(t('validation.reasonRequired'));
      return;
    }
    if (reason.length > 500) {
      setError(t('validation.maxLength', { max: 500 }));
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onOpenChange(false);
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.orders.cancelTitle')}</DialogTitle>
          <DialogDescription>{t('admin.orders.cancelText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <Field id="cancel-reason" label={t('admin.orders.cancelReason')} required error={error}>
            <Textarea
              {...fieldAria('cancel-reason', error)}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
              placeholder={t('admin.orders.cancelReasonPlaceholder')}
              rows={3}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('app.cancel')}
            </Button>
            <Button type="submit" variant="danger" size="lg" loading={busy}>
              {t('admin.orders.cancelConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Problem melden": records a note in the history without changing the status. */
export function ReportProblemDialog({ orderId, trigger }: { orderId: string; trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const report = useReportProblem();
  const submit = async () => {
    const text = note.trim();
    if (!text) return setError(t('validation.problemRequired'));
    if (text.length > 450) return setError(t('validation.maxLength', { max: 450 }));
    try {
      await report.mutateAsync({ id: orderId, note: text });
      setNote('');
      setOpen(false);
    } catch {
      /* toast shown */
    }
  };
  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
          <MessageSquareWarning aria-hidden="true" />
          {t('admin.orders.reportProblem')}
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => !report.isPending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.orders.problemTitle')}</DialogTitle>
            <DialogDescription>{t('admin.orders.problemText')}</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field id="problem-note" label={t('admin.orders.problemNote')} required error={error}>
              <Textarea
                {...fieldAria('problem-note', error)}
                aria-describedby={error ? 'problem-note-error' : 'problem-note-count'}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError(undefined);
                }}
                rows={4}
                maxLength={500}
                placeholder={t('admin.orders.problemPlaceholder')}
                autoFocus
              />
              <p id="problem-note-count" className={cn('text-right text-xs', note.length > 450 ? 'text-danger' : 'text-muted-foreground')}>
                {t('app.characters', { count: String(note.length), max: '450' })}
              </p>
            </Field>
            <DialogFooter>
              <Button variant="outline" size="lg" onClick={() => setOpen(false)} disabled={report.isPending}>
                {t('app.cancel')}
              </Button>
              <Button type="submit" size="lg" loading={report.isPending}>
                {t('admin.orders.problemSend')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Action buttons for the detail view, derived from allowedActions (server-computed per permission). */
export function OrderActionBar({ order, size = 'lg' }: { order: OrderDetailDto; size?: ButtonProps['size'] }) {
  const run = useOrderAction();
  const { can } = useAdmin();
  const [cancelOpen, setCancelOpen] = useState(false);
  const allowed = order.allowedActions;
  const main = (['prepare', 'ready', 'collect'] as OrderAction[]).filter((a) => allowed.includes(a));
  const canReport = can('PickupCollect') || can('OrdersProcess');
  const pendingAction = run.isPending ? run.variables?.action : undefined;

  return (
    <div className="flex flex-col gap-2">
      {main.map((action, i) =>
        action === 'collect' ? (
          <ConfirmDialog
            key={action}
            trigger={
              <Button size={size} variant={i === 0 ? 'primary' : 'outline'} block>
                <ActionIcon action={action} />
                {orderActionLabel(action)}
              </Button>
            }
            title={t('admin.orders.collectTitle')}
            description={t('admin.orders.collectText', {
              name: order.customerName,
              count: order.itemCount,
              total: new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency }).format(order.total),
            })}
            confirmLabel={orderActionLabel('collect')}
            variant="success"
            onConfirm={() => run.mutateAsync({ id: order.id, action })}
          />
        ) : (
          <Button
            key={action}
            size={size}
            variant={i === 0 ? 'primary' : 'outline'}
            block
            loading={pendingAction === action}
            disabled={run.isPending}
            onClick={() => run.mutate({ id: order.id, action })}
          >
            <ActionIcon action={action} />
            {orderActionLabel(action)}
          </Button>
        ),
      )}
      {canReport && <ReportProblemDialog orderId={order.id} trigger={(open) => (
        <Button variant="outline" size={size} block onClick={open}>
          <MessageSquareWarning aria-hidden="true" />
          {t('admin.orders.reportProblem')}
        </Button>
      )} />}
      {allowed.includes('no-show') && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size={size} block>
              <ActionIcon action="no-show" />
              {orderActionLabel('no-show')}
            </Button>
          }
          title={t('admin.orders.noShowTitle')}
          description={t('admin.orders.noShowText')}
          confirmLabel={orderActionLabel('no-show')}
          variant="danger"
          onConfirm={() => run.mutateAsync({ id: order.id, action: 'no-show' })}
        />
      )}
      {allowed.includes('cancel') && (
        <>
          <Button variant="ghost" size={size} block className="text-danger hover:bg-danger-soft" onClick={() => setCancelOpen(true)}>
            <ActionIcon action="cancel" />
            {orderActionLabel('cancel')}
          </Button>
          <CancelOrderDialog open={cancelOpen} onOpenChange={setCancelOpen} onConfirm={(reason) => run.mutateAsync({ id: order.id, action: 'cancel', reason })} />
        </>
      )}
    </div>
  );
}

function actorLabel(actor: string) {
  if (actor === 'Customer') return t('admin.orders.actorCustomer');
  if (actor === 'Staff') return t('admin.orders.actorStaff');
  return t('admin.orders.actorSystem');
}

/** True for history entries that are notes (e.g. reported pickup problems) rather than status changes. */
export function isNoteEntry(entry: OrderHistoryDto) {
  return entry.fromStatus !== null && entry.fromStatus === entry.toStatus;
}

function historyTitle(entry: OrderHistoryDto) {
  if (isNoteEntry(entry)) return t('admin.orders.historyNote');
  if (entry.fromStatus === null) return t('admin.orders.historyCreated');
  return `${orderStatusLabel(entry.fromStatus)} → ${orderStatusLabel(entry.toStatus)}`;
}

export function OrderHistory({ history }: { history: OrderHistoryDto[] }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-border pl-5">
      {history.map((h, i) => {
        const note = isNoteEntry(h);
        const Icon = note ? StickyNote : h.fromStatus === null ? CircleDot : statusIcon(h.toStatus);
        return (
          <li key={`${h.createdAt}-${i}`} className="relative" data-history-kind={note ? 'note' : 'status'}>
            <span
              className={cn(
                'absolute top-0.5 -left-[1.95rem] flex size-6 items-center justify-center rounded-full border-2 border-background',
                note ? 'bg-warning-soft text-warning' : 'bg-surface-muted text-muted-foreground',
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <p className="text-[0.95rem] font-medium">{historyTitle(h)}</p>
            {h.note && <p className={cn('text-[0.95rem]', note ? 'rounded-md bg-warning-soft/60 px-2.5 py-1.5' : 'text-muted-foreground')}>{h.note}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(h.createdAt)} · {actorLabel(h.actor)}
              {h.changedByName ? ` · ${t('admin.orders.historyBy', { name: h.changedByName })}` : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function statusIcon(status: OrderStatus) {
  switch (status) {
    case 'Preparing':
      return ChefHat;
    case 'ReadyForPickup':
      return PackageCheck;
    case 'Collected':
      return CheckCheck;
    case 'Cancelled':
      return Ban;
    case 'NoShow':
      return UserX;
    default:
      return ArrowRightLeft;
  }
}
