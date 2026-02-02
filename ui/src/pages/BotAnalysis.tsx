import { useState, useEffect } from 'react'
import { useDomain } from '../contexts/DomainContext'
import { useDateRangeStore } from '../stores/useDateRangeStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { DateRangePicker } from '../components/ui/date-range-picker'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '../components/ui/chart'
import { Bot, ShieldAlert, ShieldCheck, AlertTriangle, Users } from 'lucide-react'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'

interface BotCategory {
  category: string
  events: number
  visitors: number
}

interface ScoreDistribution {
  range: string
  count: number
}

interface TimeseriesData {
  period: string
  humans: number
  suspicious: number
  bad_bots: number
  good_bots: number
}

interface BotData {
  categories: BotCategory[]
  score_distribution: ScoreDistribution[]
  timeseries: TimeseriesData[]
}

const CATEGORY_LABELS: Record<string, string> = {
  human: 'Humans',
  good_bot: 'Good Bots',
  suspicious: 'Suspicious',
  bad_bot: 'Bad Bots',
}

const pieChartConfig = {
  events: {
    label: 'Events',
  },
  human: {
    label: 'Humans',
    color: 'hsl(142, 71%, 45%)',
  },
  good_bot: {
    label: 'Good Bots',
    color: 'hsl(217, 91%, 60%)',
  },
  suspicious: {
    label: 'Suspicious',
    color: 'hsl(38, 92%, 50%)',
  },
  bad_bot: {
    label: 'Bad Bots',
    color: 'hsl(0, 84%, 60%)',
  },
} satisfies ChartConfig

const areaChartConfig = {
  humans: {
    label: 'Humans',
    color: 'hsl(142, 71%, 45%)',
  },
  good_bots: {
    label: 'Good Bots',
    color: 'hsl(217, 91%, 60%)',
  },
  suspicious: {
    label: 'Suspicious',
    color: 'hsl(38, 92%, 50%)',
  },
  bad_bots: {
    label: 'Bad Bots',
    color: 'hsl(0, 84%, 60%)',
  },
} satisfies ChartConfig

const barChartConfig = {
  count: {
    label: 'Visitors',
    color: 'hsl(262, 83%, 58%)',
  },
} satisfies ChartConfig

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

export function BotAnalysis() {
  const { selectedDomain } = useDomain()
  const { dateRange, setDateRange } = useDateRangeStore()
  const [data, setData] = useState<BotData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const domain = selectedDomain?.domain || ''
        const params = new URLSearchParams()
        if (dateRange?.from && dateRange?.to) {
          params.set('start', dateRange.from.toISOString())
          params.set('end', dateRange.to.toISOString())
        }
        if (domain) {
          params.set('domain', domain)
        }
        const res = await fetch(`/api/stats/bots?${params.toString()}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to fetch bot data')
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedDomain, dateRange])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate totals
  const totalEvents = data?.categories?.reduce((sum, c) => sum + c.events, 0) || 0
  const humanEvents = data?.categories?.find(c => c.category === 'human')?.events || 0
  const goodBotEvents = data?.categories?.find(c => c.category === 'good_bot')?.events || 0
  const badBotEvents = data?.categories?.find(c => c.category === 'bad_bot')?.events || 0
  const suspiciousEvents = data?.categories?.find(c => c.category === 'suspicious')?.events || 0
  const botPercentage = totalEvents > 0 ? ((totalEvents - humanEvents) / totalEvents * 100).toFixed(1) : '0'

  // Prepare pie chart data
  const pieData = data?.categories?.map(c => ({
    name: c.category,
    value: c.events,
    fill: `var(--color-${c.category})`,
  })) || []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-7 w-7" />
            Bot Analysis
          </h1>
          <p className="text-muted-foreground">Monitor and analyze bot traffic on your site</p>
        </div>
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Traffic</p>
                <p className="text-2xl font-bold mt-1">{formatNumber(totalEvents)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bot Traffic</p>
                <p className="text-2xl font-bold mt-1">{botPercentage}%</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Good Bots</p>
                <p className="text-2xl font-bold mt-1">{formatNumber(goodBotEvents)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bad Bots Blocked</p>
                <p className="text-2xl font-bold mt-1">{formatNumber(badBotEvents + suspiciousEvents)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Traffic Breakdown</CardTitle>
            <CardDescription>Distribution of traffic by category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ChartContainer config={pieChartConfig} className="h-[300px] w-full">
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="name" hideLabel />}
                  />
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Bot Score Distribution</CardTitle>
            <CardDescription>Traffic segmented by bot detection score (0-100)</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.score_distribution && data.score_distribution.length > 0 ? (
              <ChartContainer config={barChartConfig} className="h-[300px] w-full">
                <BarChart data={data.score_distribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                  <ChartTooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No score distribution data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Traffic Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Traffic Over Time</CardTitle>
          <CardDescription>Bot vs human traffic trends</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.timeseries && data.timeseries.length > 0 ? (
            <ChartContainer config={areaChartConfig} className="h-[300px] w-full">
              <AreaChart data={data.timeseries}>
                <defs>
                  <linearGradient id="fillHumans" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-humans)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-humans)" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillGoodBots" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-good_bots)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-good_bots)" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillSuspicious" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-suspicious)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-suspicious)" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillBadBots" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-bad_bots)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-bad_bots)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                <ChartTooltip
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area type="monotone" dataKey="humans" stackId="1" stroke="var(--color-humans)" fill="url(#fillHumans)" />
                <Area type="monotone" dataKey="good_bots" stackId="1" stroke="var(--color-good_bots)" fill="url(#fillGoodBots)" />
                <Area type="monotone" dataKey="suspicious" stackId="1" stroke="var(--color-suspicious)" fill="url(#fillSuspicious)" />
                <Area type="monotone" dataKey="bad_bots" stackId="1" stroke="var(--color-bad_bots)" fill="url(#fillBadBots)" />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No timeseries data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Category Details</CardTitle>
          <CardDescription>Breakdown by traffic category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Category</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Events</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Visitors</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {data?.categories?.map((cat) => (
                  <tr key={cat.category} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: `var(--color-${cat.category})` }}
                        />
                        <span className="font-medium">{CATEGORY_LABELS[cat.category] || cat.category}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 tabular-nums">{formatNumber(cat.events)}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{formatNumber(cat.visitors)}</td>
                    <td className="text-right py-3 px-4 tabular-nums">
                      {totalEvents > 0 ? ((cat.events / totalEvents) * 100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
