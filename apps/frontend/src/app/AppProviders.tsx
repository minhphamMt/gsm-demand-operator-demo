import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type PropsWithChildren } from 'react'

import { AuthProvider } from '@/features/auth'
import { AppThemeProvider } from '@/shared/theme/AppThemeProvider'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}><AuthProvider><AppThemeProvider>{children}</AppThemeProvider></AuthProvider></QueryClientProvider>
}
