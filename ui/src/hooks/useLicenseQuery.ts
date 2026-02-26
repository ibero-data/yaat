import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { fetchAPI } from '../lib/api'
import { defaultLicense } from '../lib/types'
import type { License } from '../lib/types'

export function useLicense() {
  const query = useQuery({
    queryKey: ['license'],
    queryFn: () => fetchAPI<License>('/api/license'),
    staleTime: 10 * 60_000,
    meta: { silent: true },
  })

  const license = query.data ?? defaultLicense

  const hasFeature = useCallback(
    (feature: string): boolean => license.features[feature] ?? false,
    [license],
  )

  const getLimit = useCallback(
    (limit: string): number => license.limits[limit] ?? defaultLicense.limits[limit] ?? 0,
    [license],
  )

  return {
    ...query,
    license,
    hasFeature,
    getLimit,
  }
}

export function useUploadLicense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text()
      return fetchAPI<License>('/api/license', {
        method: 'POST',
        body: content,
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license'] })
      toast.success('License uploaded')
    },
    onError: (err) => toast.error('Failed to upload license', { description: err.message }),
  })
}

export function useRemoveLicense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => fetchAPI('/api/license', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license'] })
      toast.success('License removed')
    },
    onError: (err) => toast.error('Failed to remove license', { description: err.message }),
  })
}
