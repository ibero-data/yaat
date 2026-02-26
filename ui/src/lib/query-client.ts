import { QueryClient, QueryCache } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Don't toast for queries that opt out
      if (query.meta?.silent) return
      // Don't toast for 402/403 (license/permission errors) - these are expected
      if (error instanceof ApiError && (error.status === 402 || error.status === 403)) return
      toast.error('Failed to load data', { description: error.message })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
