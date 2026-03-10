import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchAPI, ApiError } from '../lib/api'
import type { ConsentConfig, ConsentAnalytics, ConsentRecord } from '../lib/types'

export function useConsentConfig(domainId: string | undefined) {
  return useQuery({
    queryKey: ['consent', 'config', domainId],
    queryFn: async () => {
      try {
        return await fetchAPI<ConsentConfig>(`/api/consent/configs/${domainId}`)
      } catch (err) {
        // 404 = no config yet (fresh domain), not an error
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    enabled: !!domainId,
    staleTime: 60_000,
  })
}

export function useSaveConsentConfig(domainId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ConsentConfig>) =>
      fetchAPI<ConsentConfig>(`/api/consent/configs/${domainId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent', 'config', domainId] })
      queryClient.invalidateQueries({ queryKey: ['consent', 'history', domainId] })
      toast.success('Consent configuration saved')
    },
    onError: (err) => toast.error('Failed to save consent config', { description: err.message }),
  })
}

export function useConsentConfigHistory(domainId: string | undefined) {
  return useQuery({
    queryKey: ['consent', 'history', domainId],
    queryFn: () => fetchAPI<ConsentConfig[]>(`/api/consent/configs/${domainId}/history`),
    enabled: !!domainId,
  })
}

export function useConsentAnalytics(domainId: string | undefined) {
  return useQuery({
    queryKey: ['consent', 'analytics', domainId],
    queryFn: () => fetchAPI<ConsentAnalytics>(`/api/consent/analytics/${domainId}`),
    enabled: !!domainId,
    staleTime: 60_000,
  })
}

export function useConsentRecords(domainId: string | undefined, page: number = 1) {
  return useQuery({
    queryKey: ['consent', 'records', domainId, page],
    queryFn: () => fetchAPI<{ records: ConsentRecord[]; total: number }>(`/api/consent/records/${domainId}?page=${page}&per_page=50`),
    enabled: !!domainId,
  })
}
