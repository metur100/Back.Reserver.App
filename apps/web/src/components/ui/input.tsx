import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, type ComponentPropsWithoutRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-input bg-surface px-3 text-foreground placeholder:text-subtle-foreground shadow-[inset_0_1px_1px_rgb(43_33_28/0.03)] transition-colors focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground aria-invalid:border-danger aria-invalid:bg-danger-soft/40';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, 'h-11 text-base sm:text-[0.95rem]', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'min-h-24 py-2.5 text-base sm:text-[0.95rem] leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      control,
      'select-chevron h-11 appearance-none pr-9 text-base sm:text-[0.95rem]',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = 'NativeSelect';

export const Label = forwardRef<HTMLLabelElement, ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium text-foreground', className)} {...props} />
));
Label.displayName = 'Label';

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactNode;
  labelClassName?: string;
}

/** Label + control + hint + error, wired with ids for aria-describedby (use fieldAria for the control). */
export function Field({ id, label, hint, error, required, optional, className, children, labelClassName }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
        {optional && <span className="font-normal text-muted-foreground"> ({t('app.optional')})</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, error?: string, hint?: boolean) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}
