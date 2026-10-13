import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<ElementRef<typeof DialogPrimitive.Overlay>, ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-foreground/35 backdrop-blur-[1px] animate-fade-in', className)} {...props} />
  ),
);
DialogOverlay.displayName = 'DialogOverlay';

interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, hideClose, size = 'md', ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto border border-border bg-surface p-5 shadow-overlay animate-slide-up',
          'inset-x-0 bottom-0 rounded-t-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6',
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">{t('app.close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />
);
export const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);

export const DialogTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn('font-display text-xl font-semibold', className)} {...props} />,
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = 'DialogDescription';

// ---------- Sheet (side panel built on Dialog) ----------

interface SheetContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: 'right' | 'left' | 'bottom';
}

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ className, children, side = 'right', ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col bg-surface shadow-overlay',
          side === 'right' && 'inset-y-0 right-0 h-full w-[min(26rem,100vw)] border-l border-border animate-slide-in-right',
          side === 'left' && 'inset-y-0 left-0 h-full w-[min(18rem,85vw)] border-r border-border animate-slide-in-left',
          side === 'bottom' && 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t border-border animate-slide-up',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">{t('app.close')}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
SheetContent.displayName = 'SheetContent';
