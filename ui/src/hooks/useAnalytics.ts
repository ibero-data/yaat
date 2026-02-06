import { useState, useCallback } from 'react'
import type { DateRange } from 'react-day-picker'

interface OverviewStats {
  total_events: number
  unique_visitors: number
  sessions: number
  pageviews: number
  live_visitors: number
  bounce_rate: number
  avg_session_seconds: number
  prev_total_events?: number
  prev_unique_visitors?: number
  prev_sessions?: number
  prev_pageviews?: number
  prev_bounce_rate?: number
  prev_avg_session_seconds?: number
}

interface TimeseriesPoint {
  period: string
  pageviews: number
  visitors: number
}

interface TopPage {
  path: string
  views: number
  visitors: number
}

interface Referrer {
  source: string
  referrer_type?: string
  visits: number
  visitors: number
}

interface GeoData {
  country: string
  visitors: number
}

interface DeviceData {
  device: string
  visitors: number
}

interface BrowserData {
  browser: string
  visitors: number
}

interface WebVitals {
  lcp: number
  cls: number
  fcp: number
  ttfb: number
  inp: number
  samples: number
}

interface ErrorSummary {
  error_hash: string
  error_type: string
  error_message: string
  occurrences: number
  affected_sessions: number
}

interface Campaign {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  visitors: number
  sessions: number
}

interface CustomEvent {
  event_name: string
  count: number
  unique_visitors: number
}

interface OutboundLink {
  url: string
  clicks: number
  unique_visitors: number
}

interface MapPoint {
  city: string
  country: string
  lat: number
  lng: number
  visitors: number
  pageviews: number
}

export interface AnalyticsFilters {
  country?: string
  browser?: string
  device?: string
  page?: string
  referrer?: string
}

export interface AnalyticsData {
  overview: OverviewStats | null
  timeseries: TimeseriesPoint[]
  topPages: TopPage[]
  referrers: Referrer[]
  geo: GeoData[]
  mapData: MapPoint[]
  devices: DeviceData[]
  browsers: BrowserData[]
  vitals: WebVitals | null
  errors: ErrorSummary[]
  campaigns: Campaign[]
  customEvents: CustomEvent[]
  outboundLinks: OutboundLink[]
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsData>({
    overview: null,
    timeseries: [],
    topPages: [],
    referrers: [],
    geo: [],
    mapData: [],
    devices: [],
    browsers: [],
    vitals: null,
    errors: [],
    campaigns: [],
    customEvents: [],
    outboundLinks: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchAnalytics = useCallback(async (dateRange?: DateRange, domain?: string, filters?: AnalyticsFilters) => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (dateRange?.from && dateRange?.to) {
      params.set('start', dateRange.from.toISOString())
      params.set('end', dateRange.to.toISOString())
    } else {
      // Default to 7 days for backward compatibility
      params.set('days', '7')
    }
    if (domain) {
      params.set('domain', domain)
    }
    if (filters) {
      if (filters.country) params.set('country', filters.country)
      if (filters.browser) params.set('browser', filters.browser)
      if (filters.device) params.set('device', filters.device)
      if (filters.page) params.set('page', filters.page)
      if (filters.referrer) params.set('referrer', filters.referrer)
    }
    const qs = params.toString()

    try {
      const [
        overview,
        timeseries,
        topPages,
        referrers,
        geo,
        mapData,
        devices,
        browsers,
        vitals,
        errors,
        campaigns,
        customEvents,
        outboundLinks,
      ] = await Promise.all([
        fetchJSON<OverviewStats>(`/api/stats/overview?${qs}`),
        fetchJSON<TimeseriesPoint[]>(`/api/stats/timeseries?${qs}`),
        fetchJSON<TopPage[]>(`/api/stats/pages?${qs}`),
        fetchJSON<Referrer[]>(`/api/stats/referrers?${qs}`),
        fetchJSON<GeoData[]>(`/api/stats/geo?${qs}`),
        fetchJSON<MapPoint[]>(`/api/stats/map?${qs}`).catch(() => []),
        fetchJSON<DeviceData[]>(`/api/stats/devices?${qs}`),
        fetchJSON<BrowserData[]>(`/api/stats/browsers?${qs}`),
        fetchJSON<WebVitals>(`/api/stats/vitals?${qs}`).catch(() => null),
        fetchJSON<ErrorSummary[]>(`/api/stats/errors?${qs}`).catch(() => []),
        fetchJSON<Campaign[]>(`/api/stats/campaigns?${qs}`).catch(() => []),
        fetchJSON<CustomEvent[]>(`/api/stats/events?${qs}`).catch(() => []),
        fetchJSON<OutboundLink[]>(`/api/stats/outbound?${qs}`).catch(() => []),
      ])

      setData({
        overview,
        timeseries,
        topPages,
        referrers,
        geo,
        mapData,
        devices,
        browsers,
        vitals,
        errors,
        campaigns,
        customEvents,
        outboundLinks,
      })
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    data,
    loading,
    error,
    refresh: fetchAnalytics,
  }
}
