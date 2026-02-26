import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { fetchAPI } from '../lib/api'
import { useDateRangeStore } from '../stores/useDateRangeStore'
import { useDomainStore } from '../stores/useDomainStore'
import { useFilterStore } from '../stores/useFilterStore'
import { useDomains } from './useDomains'
import type {
  OverviewStats,
  TimeseriesPoint,
  TopPage,
  Referrer,
  GeoData,
  MapPoint,
  DeviceData,
  BrowserData,
  WebVitals,
  ErrorSummary,
  Campaign,
  CustomEvent,
  OutboundLink,
  BotData,
  FraudSummary,
  SourceQuality,
  AdFraudCampaign,
} from '../lib/types'

function useAnalyticsParams() {
  const { dateRange } = useDateRangeStore()
  const { selectedDomainId } = useDomainStore()
  const { filters } = useFilterStore()
  const { data: domains, isLoading: domainsLoading } = useDomains()
  const selectedDomain = domains?.find((d) => d.id === selectedDomainId)

  const params = new URLSearchParams()
  if (dateRange?.from && dateRange?.to) {
    params.set('start', dateRange.from.toISOString())
    params.set('end', dateRange.to.toISOString())
  } else {
    params.set('days', '7')
  }
  if (selectedDomain) params.set('domain', selectedDomain.domain)
  if (filters.country) params.set('country', filters.country)
  if (filters.browser) params.set('browser', filters.browser)
  if (filters.device) params.set('device', filters.device)
  if (filters.page) params.set('page', filters.page)
  if (filters.referrer) params.set('referrer', filters.referrer)
  if (filters.bot_filter) params.set('bot_filter', filters.bot_filter)

  return { qs: params.toString(), enabled: !domainsLoading }
}

export function useOverview() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'overview', qs],
    queryFn: () => fetchAPI<OverviewStats>(`/api/stats/overview?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useTimeseries() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'timeseries', qs],
    queryFn: () => fetchAPI<TimeseriesPoint[]>(`/api/stats/timeseries?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useTopPages() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'pages', qs],
    queryFn: () => fetchAPI<TopPage[]>(`/api/stats/pages?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReferrers() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'referrers', qs],
    queryFn: () => fetchAPI<Referrer[]>(`/api/stats/referrers?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useGeo() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'geo', qs],
    queryFn: () => fetchAPI<GeoData[]>(`/api/stats/geo?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMapData() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'map', qs],
    queryFn: () => fetchAPI<MapPoint[]>(`/api/stats/map?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  })
}

export function useDevices() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'devices', qs],
    queryFn: () => fetchAPI<DeviceData[]>(`/api/stats/devices?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useBrowsers() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'browsers', qs],
    queryFn: () => fetchAPI<BrowserData[]>(`/api/stats/browsers?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useVitals() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'vitals', qs],
    queryFn: () => fetchAPI<WebVitals>(`/api/stats/vitals?${qs}`),
    enabled,
    retry: false,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })
}

export function useErrors() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'errors', qs],
    queryFn: () => fetchAPI<ErrorSummary[]>(`/api/stats/errors?${qs}`),
    enabled,
    retry: false,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })
}

export function useCampaigns() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'campaigns', qs],
    queryFn: () => fetchAPI<Campaign[]>(`/api/stats/campaigns?${qs}`),
    enabled,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })
}

export function useCustomEvents() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'events', qs],
    queryFn: () => fetchAPI<CustomEvent[]>(`/api/stats/events?${qs}`),
    enabled,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })
}

export function useOutboundLinks() {
  const { qs, enabled } = useAnalyticsParams()
  return useQuery({
    queryKey: ['stats', 'outbound', qs],
    queryFn: () => fetchAPI<OutboundLink[]>(`/api/stats/outbound?${qs}`),
    enabled,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })
}

// --- Bot Analysis ---

function useBotParams() {
  const { dateRange } = useDateRangeStore()
  const { selectedDomainId } = useDomainStore()
  const { data: domains, isLoading: domainsLoading } = useDomains()
  const selectedDomain = domains?.find((d) => d.id === selectedDomainId)

  const params = new URLSearchParams()
  if (dateRange?.from && dateRange?.to) {
    params.set('start', dateRange.from.toISOString())
    params.set('end', dateRange.to.toISOString())
  } else {
    params.set('days', '7')
  }
  if (selectedDomain) params.set('domain', selectedDomain.domain)

  return { qs: params.toString(), enabled: !domainsLoading }
}

export function useBotAnalysis() {
  const { qs, enabled } = useBotParams()
  return useQuery({
    queryKey: ['stats', 'bots', qs],
    queryFn: () => fetchAPI<BotData>(`/api/stats/bots?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

// --- Ad Fraud ---

export function useFraudSummary() {
  const { qs, enabled } = useBotParams()
  return useQuery({
    queryKey: ['stats', 'fraud', qs],
    queryFn: () => fetchAPI<FraudSummary>(`/api/stats/fraud?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useSourceQuality() {
  const { qs, enabled } = useBotParams()
  return useQuery({
    queryKey: ['sources', 'quality', qs],
    queryFn: () => fetchAPI<SourceQuality[]>(`/api/sources/quality?${qs}`),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useAdFraudCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => fetchAPI<AdFraudCampaign[]>('/api/campaigns'),
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; cpc: number; cpm: number; budget: number }) =>
      fetchAPI<AdFraudCampaign>('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI<void>(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}
