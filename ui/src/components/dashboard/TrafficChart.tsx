import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useTimeseries } from '../../hooks/useAnalyticsQueries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '../ui/chart'
import { ChartSkeleton } from './skeletons'

const chartConfig = {
  pageviews: { label: 'Pageviews', color: 'var(--chart-1)' },
  visitors: { label: 'Visitors', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function TrafficChart() {
  const { data, isLoading, isPlaceholderData } = useTimeseries()

  if (isLoading && !data) return <ChartSkeleton />

  const timeseries = data ?? []

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Traffic Overview</CardTitle>
        <CardDescription>Pageviews and unique visitors over time</CardDescription>
      </CardHeader>
      <CardContent>
        {timeseries.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
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
  )
}
