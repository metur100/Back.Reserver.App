import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { isApiError } from '@/api/client';
import { AuthProvider } from '@/auth/AuthProvider';
import { TooltipProvider } from '@/components/ui/menu';
import { Toaster } from '@/components/ui/toast';
import { createRouter } from './router';
import './index.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  defaultOptions: {
    queries: {
      // 4xx errors are final (the server is authoritative); retry only network/5xx a couple of times.
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

const router = createRouter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
