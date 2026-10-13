import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 aria-disabled:opacity-55 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover active:bg-primary-strong',
        secondary: 'bg-surface-muted text-foreground hover:bg-surface-sunken border border-border',
        outline: 'border border-border-strong bg-surface text-foreground hover:bg-surface-muted',
        ghost: 'text-foreground hover:bg-surface-muted',
        danger: 'bg-danger text-white shadow-soft hover:bg-danger-strong',
        success: 'bg-success text-white shadow-soft hover:bg-success-strong',
        link: 'text-primary-strong underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 rounded-md px-3 text-sm [&_svg]:size-4',
        md: 'h-11 rounded-md px-4 text-[0.95rem] [&_svg]:size-4.5',
        lg: 'h-12 rounded-lg px-5 text-base [&_svg]:size-5',
        xl: 'h-14 rounded-lg px-6 text-lg [&_svg]:size-6',
        icon: 'size-11 rounded-md [&_svg]:size-5',
        'icon-sm': 'size-9 rounded-md [&_svg]:size-4',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        type={asChild ? undefined : (type ?? 'button')}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
