export interface OverviewStats {
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

export interface TimeseriesPoint {
  period: string
  pageviews: number
  visitors: number
}

export interface TopPage {
  path: string
  views: number
  visitors: number
}

export interface Referrer {
  source: string
  referrer_type?: string
  visits: number
  visitors: number
}

export interface GeoData {
  country: string
  visitors: number
}

export interface DeviceData {
  device: string
  visitors: number
}

export interface BrowserData {
  browser: string
  visitors: number
}

export interface WebVitals {
  lcp: number
  cls: number
  fcp: number
  ttfb: number
  inp: number
  samples: number
}

export interface ErrorSummary {
  error_hash: string
  error_type: string
  error_message: string
  occurrences: number
  affected_sessions: number
}

export interface Campaign {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  visitors: number
  sessions: number
}

export interface CustomEvent {
  event_name: string
  count: number
  unique_visitors: number
}

export interface OutboundLink {
  url: string
  clicks: number
  unique_visitors: number
}

export interface MapPoint {
  city: string
  country: string
  lat: number
  lng: number
  visitors: number
  pageviews: number
}

// Bot Analysis types
export interface BotCategory {
  category: string
  events: number
  visitors: number
}

export interface ScoreDistribution {
  range: string
  count: number
}

export interface BotTimeseries {
  period: string
  humans: number
  suspicious: number
  bad_bots: number
  good_bots: number
}

export interface BotDetail {
  browser_name: string
  category: string
  score: number
  signals: string[]
  hits: number
  visitors: number
  sessions: number
  last_seen: number
}

export interface BotData {
  categories: BotCategory[]
  score_distribution: ScoreDistribution[]
  timeseries: BotTimeseries[]
  top_bots: BotDetail[]
}

// Ad Fraud types
export interface FraudSummary {
  total_clicks: number
  invalid_clicks: number
  invalid_rate: number
  wasted_spend: number
  datacenter_traffic: number
  suspicious_sessions: number
}

export interface SourceQuality {
  source: string
  medium: string
  quality_score: number
  clicks: number
  invalid_clicks: number
  human_rate: number
}

export interface AdFraudCampaign {
  id: string
  name: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  cpc: number
  cpm: number
  budget: number
  created_at: number
}

export interface AnalyticsFilters {
  country?: string
  browser?: string
  device?: string
  page?: string
  referrer?: string
  bot_filter?: string
}

export interface Domain {
  id: string
  name: string
  domain: string
  site_id: string
  is_active: boolean
  created_at: number
}

export interface License {
  tier: 'community' | 'pro' | 'enterprise'
  state: 'valid' | 'expired' | 'tampered' | 'missing'
  features: Record<string, boolean>
  limits: Record<string, number>
  expires_at: string | null
  licensee: string
}

export const defaultLicense: License = {
  tier: 'community',
  state: 'missing',
  features: {},
  limits: { max_users: 3, max_retention_days: 7 },
  expires_at: null,
  licensee: '',
}
