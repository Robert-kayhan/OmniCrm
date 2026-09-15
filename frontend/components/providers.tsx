'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { ApiError } from '@/lib/api';

/**
 * Every client-side provider, in dependency order.
 *
 * Auth sits inside the query client because it clears the cache on logout, and
 * the socket sits inside auth because it cannot connect without a token.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per browser session rather than per render, so a re-render
  // never throws away the cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The socket pushes changes, so aggressive polling would be waste.
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Retrying an auth or permission failure just repeats it, and
              // retrying a 404 cannot conjure the row into existence.
              if (error instanceof ApiError) {
                if ([401, 403, 404, 422].includes(error.status)) return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <SocketProvider>{children}</SocketProvider>
          </AuthProvider>
          <Toaster position="bottom-right" closeButton richColors />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
