import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { forwardRef, useState, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes, type ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export const AlertDialogContent = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 animate-fade-in" />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex w-full flex-col gap-4 border border-border bg-surface p-5 shadow-overlay animate-slide-up',
        'inset-x-0 bottom-0 rounded-t-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6',
        className,
      )}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
));
AlertDialogContent.displayName = 'AlertDialogContent';

export const AlertDialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-2', className)} {...props} />
);
export const AlertDialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);
export const AlertDialogTitle = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => <AlertDialogPrimitive.Title ref={ref} className={cn('font-display text-xl font-semibold', className)} {...props} />);
AlertDialogTitle.displayName = 'AlertDialogTitle';

export const AlertDialogDescription = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn('text-[0.95rem] text-muted-foreground', className)} {...props} />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

interface ConfirmDialogProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  variant?: ButtonProps['variant'];
  /** May return a promise; the dialog stays open (with spinner) until it resolves and closes on success. */
  onConfirm: () => unknown;
  confirmDisabled?: boolean;
}

/** Accessible confirmation dialog with async confirm handling. */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  onConfirm,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (busy) return;
    setOpenState(v);
    onOpenChange?.(v);
  };
  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setBusy(false);
      setOpenState(false);
      onOpenChange?.(false);
    } catch {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" size="lg" disabled={busy}>
              {cancelLabel ?? t('app.cancel')}
            </Button>
          </AlertDialogCancel>
          <Button
            variant={variant}
            size="lg"
            loading={busy}
            disabled={confirmDisabled}
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
