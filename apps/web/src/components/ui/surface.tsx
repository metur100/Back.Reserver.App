import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ---------- Card ----------

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-soft', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5', className)} {...props} />;
}

export function CardTitle({ className, as: As = 'h2', ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' }) {
  return <As className={cn('text-base font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}

// ---------- Badge ----------

export const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap [&_svg]:shrink-0', {
  variants: {
    tone: {
      neutral: 'border-border bg-surface-muted text-muted-foreground',
      info: 'border-info/25 bg-info-soft text-info',
      success: 'border-success/25 bg-success-soft text-success-strong',
      warning: 'border-warning/25 bg-warning-soft text-warning',
      danger: 'border-danger/25 bg-danger-soft text-danger-strong',
      primary: 'border-primary/25 bg-primary-soft text-primary-strong',
    },
    size: {
      sm: 'px-2 py-0.5 text-xs [&_svg]:size-3.5',
      md: 'px-2.5 py-1 text-sm [&_svg]:size-4',
      lg: 'px-3.5 py-1.5 text-base [&_svg]:size-5',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

// ---------- Alert / callout ----------

const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: keyof typeof alertIcons;
  title?: ReactNode;
  action?: ReactNode;
  live?: boolean;
}

export function Alert({ tone = 'info', title, children, action, live, className, ...props }: AlertProps) {
  const Icon = alertIcons[tone];
  const toneClass = {
    info: 'border-info/25 bg-info-soft text-foreground [&_.alert-icon]:text-info',
    success: 'border-success/25 bg-success-soft text-foreground [&_.alert-icon]:text-success',
    warning: 'border-warning/30 bg-warning-soft text-foreground [&_.alert-icon]:text-warning',
    danger: 'border-danger/25 bg-danger-soft text-foreground [&_.alert-icon]:text-danger',
  }[tone];
  return (
    <div
      role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-[0.95rem]', toneClass, className)}
      {...props}
    >
      <Icon className="alert-icon mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[0.95rem] leading-relaxed">{children}</div>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    </div>
  );
}

// ---------- Skeleton ----------

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse-soft rounded-md bg-surface-sunken', className)} {...props} />;
}

// ---------- Separator ----------

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cn(vertical ? 'w-px self-stretch' : 'h-px w-full', 'bg-border', className)} />;
}
