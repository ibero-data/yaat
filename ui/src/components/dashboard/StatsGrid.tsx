import { Activity, Users, Eye, MousePointerClick, TrendingDown, Clock } from 'lucide-react'
import { useOverview } from '../../hooks/useAnalyticsQueries'
import { formatNumber, formatDuration } from '../../lib/utils'
import { StatCard, calcTrend } from './StatCard'
import { StatsGridSkeleton } from './skeletons'

export function StatsGrid() {
  const { data, isLoading, isPlaceholderData } = useOverview()

  if (isLoading && !data) return <StatsGridSkeleton />

  const o = data

  const bounceTrend = calcTrend(o?.bounce_rate ?? 0, o?.prev_bounce_rate)

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <StatCard
        title="Live Visitors"
        value={o?.live_visitors ?? 0}
        subtitle="Active now"
        icon={Activity}
      />
      <StatCard
        title="Unique Visitors"
        value={formatNumber(o?.unique_visitors ?? 0)}
        subtitle="vs. prev period"
        icon={Users}
        {...calcTrend(o?.unique_visitors ?? 0, o?.prev_unique_visitors)}
      />
      <StatCard
        title="Pageviews"
        value={formatNumber(o?.pageviews ?? 0)}
        subtitle="vs. prev period"
        icon={Eye}
        {...calcTrend(o?.pageviews ?? 0, o?.prev_pageviews)}
      />
      <StatCard
        title="Sessions"
        value={formatNumber(o?.sessions ?? 0)}
        subtitle="vs. prev period"
        icon={MousePointerClick}
        {...calcTrend(o?.sessions ?? 0, o?.prev_sessions)}
      />
      <StatCard
        title="Bounce Rate"
        value={`${(o?.bounce_rate ?? 0).toFixed(1)}%`}
        subtitle="vs. prev period"
        icon={TrendingDown}
        trend={bounceTrend.trend}
        trendUp={bounceTrend.trendUp !== undefined ? !bounceTrend.trendUp : undefined}
      />
      <StatCard
        title="Avg. Session"
        value={formatDuration(o?.avg_session_seconds ?? 0)}
        subtitle="vs. prev period"
        icon={Clock}
        {...calcTrend(o?.avg_session_seconds ?? 0, o?.prev_avg_session_seconds)}
      />
    </div>
  )
}
