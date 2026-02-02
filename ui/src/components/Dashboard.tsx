import { useEffect, useState } from 'react'
import { useAnalytics } from '../hooks/useAnalytics'
import { useDateRangeStore } from '../stores/useDateRangeStore'
import { useRealtime } from '../hooks/useRealtime'
import { useLicense } from '../hooks/useLicense'
import { useDomain } from '../contexts/DomainContext'
import { FeatureGate, FeatureBadge } from './FeatureGate'
import { formatNumber, formatDuration } from '../lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { DateRangePicker } from './ui/date-range-picker'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from './ui/chart'
import {
  Users,
  Eye,
  MousePointerClick,
  Globe,
  RefreshCw,
  Activity,
  AlertTriangle,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Monitor,
  Smartphone,
  Tablet,
  ExternalLink,
  Clock,
  TrendingDown,
  Megaphone,
  Zap,
  Link2,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
}

const chartConfig = {
  pageviews: {
    label: 'Pageviews',
    color: 'var(--chart-1)',
  },
  visitors: {
    label: 'Visitors',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: typeof Activity
  trend?: string
  trendUp?: boolean
}) {
  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md hover:border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold tracking-tight truncate">{value}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {trend && (
                <span className={`flex items-center text-xs font-medium ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {trend}
                </span>
              )}
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProgressList({
  items,
  colorClass = 'bg-primary',
}: {
  items: { label: string; value: number; percentage: number }[]
  colorClass?: string
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between text-sm gap-2">
            <span className="text-foreground truncate flex-1 font-medium">
              {item.label}
            </span>
            <span className="text-muted-foreground tabular-nums shrink-0">
              {formatNumber(item.value)}
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${colorClass} rounded-full transition-all duration-500`}
              style={{ width: `${item.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const { data, loading, error, refresh } = useAnalytics()
  const { connected, lastEvent } = useRealtime()
  const { license } = useLicense()
  const { selectedDomain } = useDomain()

  const { dateRange, setDateRange } = useDateRangeStore()
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    handleRefresh()
  }, [dateRange, selectedDomain])

  async function handleRefresh() {
    const domainFilter = selectedDomain?.domain || undefined
    await refresh(dateRange, domainFilter)
    setLastRefresh(new Date())
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to load analytics</h2>
            <p className="text-muted-foreground mb-4">{error.message}</p>
            <Button onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getRelativeTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    return `${Math.floor(diffMins / 60)}h ago`
  }

  // Calculate totals for device breakdown
  const totalDeviceVisitors = data.devices.reduce((acc, d) => acc + d.visitors, 0)

  // Prepare top pages data
  const topPagesData = data.topPages.slice(0, 8).map((page) => {
    const maxViews = data.topPages[0]?.views || 1
    return {
      label: page.path || '/',
      value: page.views,
      percentage: (page.views / maxViews) * 100,
    }
  })

  // Prepare referrers data
  const referrersData = (data.referrers || []).slice(0, 8).map((ref) => {
    const maxVisitors = data.referrers[0]?.visitors || 1
    return {
      label: ref.source || 'Direct / None',
      value: ref.visitors,
      percentage: (ref.visitors / maxVisitors) * 100,
    }
  })

  // Prepare browsers data
  const browsersData = data.browsers.slice(0, 5).map((browser) => {
    const maxVisitors = data.browsers[0]?.visitors || 1
    return {
      label: browser.browser || 'Unknown',
      value: browser.visitors,
      percentage: (browser.visitors / maxVisitors) * 100,
    }
  })

  // Prepare geo data
  const geoData = data.geo.slice(0, 5).map((geo) => {
    const maxVisitors = data.geo[0]?.visitors || 1
    return {
      label: geo.country || 'Unknown',
      value: geo.visitors,
      percentage: (geo.visitors / maxVisitors) * 100,
    }
  })

  // Prepare campaigns data
  const campaignsData = (data.campaigns || []).slice(0, 5).map((campaign) => {
    const maxVisitors = data.campaigns[0]?.visitors || 1
    const label = campaign.utm_campaign && campaign.utm_campaign !== '(none)'
      ? campaign.utm_campaign
      : campaign.utm_source && campaign.utm_source !== '(direct)'
        ? `${campaign.utm_source}${campaign.utm_medium && campaign.utm_medium !== '(none)' ? ' / ' + campaign.utm_medium : ''}`
        : 'Direct Traffic'
    return {
      label,
      value: campaign.visitors,
      percentage: (campaign.visitors / maxVisitors) * 100,
    }
  })

  // Prepare custom events data
  const customEventsData = (data.customEvents || []).slice(0, 5).map((event) => {
    const maxCount = data.customEvents[0]?.count || 1
    return {
      label: event.event_name,
      value: event.count,
      percentage: (event.count / maxCount) * 100,
    }
  })

  // Prepare outbound links data
  const outboundLinksData = (data.outboundLinks || []).slice(0, 5).map((link) => {
    const maxClicks = data.outboundLinks[0]?.clicks || 1
    let displayUrl = link.url || 'Unknown'
    if (displayUrl && !displayUrl.startsWith('(') && displayUrl.includes('.')) {
      try {
        const urlObj = new URL(link.url)
        displayUrl = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '')
      } catch {}
    }
    return {
      label: displayUrl,
      value: link.clicks,
      percentage: (link.clicks / maxClicks) * 100,
    }
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {selectedDomain && (
              <span className="text-sm text-muted-foreground">
                {selectedDomain.domain}
              </span>
            )}
            {lastRefresh && (
              <span className="text-sm text-muted-foreground">
                Updated {getRelativeTime(lastRefresh)}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {connected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">Live</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground"></span>
                  <span className="text-xs text-muted-foreground">Offline</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
          <Button onClick={handleRefresh} disabled={loading} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* License banner */}
      {license?.tier === 'community' && (
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 border-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="text-white">
                <p className="font-semibold">Upgrade to Pro</p>
                <p className="text-sm text-white/80">
                  Unlock performance monitoring, error tracking, and more.
                </p>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <a href="https://yaat.dev/pricing" target="_blank" rel="noopener noreferrer">
                  View Plans
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="Live Visitors"
          value={data.overview?.live_visitors ?? 0}
          subtitle="Active now"
          icon={Activity}
        />
        <StatCard
          title="Unique Visitors"
          value={formatNumber(data.overview?.unique_visitors ?? 0)}
          subtitle="Selected period"
          icon={Users}
        />
        <StatCard
          title="Pageviews"
          value={formatNumber(data.overview?.pageviews ?? 0)}
          subtitle="Selected period"
          icon={Eye}
        />
        <StatCard
          title="Sessions"
          value={formatNumber(data.overview?.sessions ?? 0)}
          subtitle="Selected period"
          icon={MousePointerClick}
        />
        <StatCard
          title="Bounce Rate"
          value={`${(data.overview?.bounce_rate ?? 0).toFixed(1)}%`}
          subtitle="Single page visits"
          icon={TrendingDown}
        />
        <StatCard
          title="Avg. Session"
          value={formatDuration(data.overview?.avg_session_seconds ?? 0)}
          subtitle="Time on site"
          icon={Clock}
        />
      </div>

      {/* Main chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Traffic Overview</CardTitle>
          <CardDescription>Pageviews and unique visitors over time</CardDescription>
        </CardHeader>
        <CardContent>
          {data.timeseries.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={data.timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillPageviews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-pageviews)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-pageviews)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-visitors)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-visitors)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => {
                    if (!v) return ''
                    const parts = v.split(' ')
                    return parts[0]?.slice(5) || v
                  }}
                  axisLine={false}
                  tickLine={false}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  className="text-muted-foreground"
                  width={40}
                />
                <ChartTooltip
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="pageviews"
                  stroke="var(--color-pageviews)"
                  strokeWidth={2}
                  fill="url(#fillPageviews)"
                />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  stroke="var(--color-visitors)"
                  strokeWidth={2}
                  fill="url(#fillVisitors)"
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No data for the selected period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Top Pages</CardTitle>
            <CardDescription>Most visited pages</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressList items={topPagesData} colorClass="bg-chart-1" />
          </CardContent>
        </Card>

        {/* Top Referrers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Top Referrers</CardTitle>
            <CardDescription>Where your visitors come from</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressList items={referrersData} colorClass="bg-chart-2" />
          </CardContent>
        </Card>
      </div>

      {/* Three column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.devices.length > 0 ? (
                data.devices.map((device, i) => {
                  const Icon = DEVICE_ICONS[device.device?.toLowerCase()] || Monitor
                  const percentage = totalDeviceVisitors > 0
                    ? ((device.visitors / totalDeviceVisitors) * 100).toFixed(1)
                    : '0'
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-muted">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium capitalize">{device.device || 'Unknown'}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatNumber(device.visitors)}</p>
                        <p className="text-xs text-muted-foreground">{percentage}%</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No device data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Browsers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Browsers</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressList items={browsersData} colorClass="bg-chart-4" />
          </CardContent>
        </Card>

        {/* Countries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Countries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {geoData.length > 0 ? (
                geoData.map((geo, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between text-sm gap-2">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{geo.label}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums">{formatNumber(geo.value)}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-chart-5 rounded-full transition-all duration-500"
                        style={{ width: `${geo.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No location data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pro features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Web Vitals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Web Vitals</CardTitle>
              <FeatureBadge feature="performance" />
            </div>
            <CardDescription>Core Web Vitals performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureGate feature="performance">
              {data.vitals ? (
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { label: 'LCP', value: formatDuration(data.vitals.lcp), desc: 'Loading' },
                    { label: 'FCP', value: formatDuration(data.vitals.fcp), desc: 'First Paint' },
                    { label: 'CLS', value: data.vitals.cls.toFixed(3), desc: 'Layout Shift' },
                    { label: 'TTFB', value: formatDuration(data.vitals.ttfb), desc: 'Server' },
                    { label: 'INP', value: formatDuration(data.vitals.inp), desc: 'Interaction' },
                  ].map((metric) => (
                    <div key={metric.label} className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold tracking-tight">{metric.value}</p>
                      <p className="text-sm font-semibold text-muted-foreground">{metric.label}</p>
                      <p className="text-xs text-muted-foreground">{metric.desc}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">No performance data yet</p>
              )}
            </FeatureGate>
          </CardContent>
        </Card>

        {/* Errors */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Errors</CardTitle>
              <FeatureBadge feature="error_tracking" />
            </div>
            <CardDescription>JavaScript errors from your users</CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureGate feature="error_tracking">
              {data.errors.length > 0 ? (
                <div className="space-y-3">
                  {data.errors.slice(0, 4).map((err, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {err.error_message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {err.occurrences} occurrences
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">No errors recorded</p>
              )}
            </FeatureGate>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns, Custom Events, Outbound Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaigns */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Campaigns</CardTitle>
            </div>
            <CardDescription>UTM campaign traffic sources</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressList items={campaignsData} colorClass="bg-pink-500" />
          </CardContent>
        </Card>

        {/* Custom Events */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Custom Events</CardTitle>
            </div>
            <CardDescription>User interactions and conversions</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressList items={customEventsData} colorClass="bg-cyan-500" />
          </CardContent>
        </Card>

        {/* Outbound Links */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Outbound Links</CardTitle>
            </div>
            <CardDescription>External links clicked by visitors</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressList items={outboundLinksData} colorClass="bg-orange-500" />
          </CardContent>
        </Card>
      </div>

      {/* Live event indicator */}
      {lastEvent && lastEvent.type === 'batch' && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm animate-pulse flex items-center gap-2">
          <Activity className="h-4 w-4" />
          +{lastEvent.events} events
        </div>
      )}
    </div>
  )
}
