import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ---------- Dropdown menu ----------

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-overlay animate-fade-in', className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

const itemClass =
  'relative flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-[0.95rem] outline-none data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item ref={ref} className={cn(itemClass, destructive && 'text-danger', className)} {...props} />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem ref={ref} className={cn(itemClass, 'pl-8', className)} {...props}>
    <span className="absolute left-2.5 flex size-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check aria-hidden="true" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

export const DropdownMenuLabel = ({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) => (
  <DropdownMenuPrimitive.Label className={cn('px-2.5 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase', className)} {...props} />
);
export const DropdownMenuSeparator = ({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) => (
  <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);

// ---------- Popover ----------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Content>, ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(
  ({ className, align = 'end', sideOffset = 6, ...props }, ref) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface p-3 shadow-overlay animate-fade-in outline-none', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';

// ---------- Tooltip ----------

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-sm text-background shadow-raised animate-fade-in"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-foreground" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
