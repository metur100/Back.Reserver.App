import { toast as sonner, Toaster as SonnerToaster } from 'sonner';
import { errorMessage } from '@/api/client';

/** App-wide toaster (sonner renders an aria-live region). */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !border !border-border !bg-surface !text-foreground !shadow-overlay !text-[0.95rem] !font-sans',
          description: '!text-muted-foreground',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
        },
      }}
    />
  );
}

export const toast = {
  success: (message: string, description?: string) => sonner.success(message, { description, duration: 2500 }),
  error: (message: string, description?: string) => sonner.error(message, { description }),
  info: (message: string, description?: string) => sonner.info(message, { description }),
  warning: (message: string, description?: string) => sonner.warning(message, { description }),
  /** Shows the server's German problem title (or a generic message). */
  fromError: (error: unknown) => sonner.error(errorMessage(error)),
};
