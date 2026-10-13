import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

// ---------- Checkbox ----------

export const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex size-5.5 shrink-0 items-center justify-center rounded-[5px] border-2 border-border-strong bg-surface transition-colors',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  ),
);
Checkbox.displayName = 'Checkbox';

// ---------- Switch ----------

export const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'bg-border-strong data-[state=checked]:bg-success',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        // larger invisible hit area for touch
        'before:absolute before:-inset-2 before:content-[""]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-6 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  ),
);
Switch.displayName = 'Switch';

// ---------- Tabs ----------

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-muted p-1 scrollbar-none', className)}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors',
        'hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-soft [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn('mt-4 outline-none', className)} {...props} />,
);
TabsContent.displayName = 'TabsContent';

// ---------- Select (Radix) ----------

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export const SelectTrigger = forwardRef<ElementRef<typeof SelectPrimitive.Trigger>, ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 text-left text-base sm:text-[0.95rem]',
        'focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-subtle-foreground [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  ),
);
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = forwardRef<ElementRef<typeof SelectPrimitive.Content>, ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  ({ className, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={4}
        className={cn(
          'z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface shadow-overlay animate-fade-in',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<ElementRef<typeof SelectPrimitive.Item>, ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex min-h-10 cursor-default select-none items-center rounded-md py-2 pr-2.5 pl-8 text-[0.95rem] outline-none data-[highlighted]:bg-surface-muted data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  ),
);
SelectItem.displayName = 'SelectItem';

// ---------- Collapsible ----------

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
export const CollapsibleContent = CollapsiblePrimitive.Content;
