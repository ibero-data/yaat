import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchAPI } from '../lib/api'
import type { Domain } from '../lib/types'

export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: () => fetchAPI<Domain[]>('/api/domains'),
    staleTime: 5 * 60_000,
  })
}

export function useCreateDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; domain: string }) =>
      fetchAPI<Domain>('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Domain created')
    },
    onError: (err) => toast.error('Failed to create domain', { description: err.message }),
  })
}

export function useDeleteDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/api/domains/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Domain deleted')
    },
    onError: (err) => toast.error('Failed to delete domain', { description: err.message }),
  })
}
