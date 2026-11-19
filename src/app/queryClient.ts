import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: 1,
        refetchOnWindowFocus: true, // TD issue 4: refetch on tab focus
      },
      mutations: { retry: 0 }, // queue actions are never retried blindly
    },
  })
}
