import { useState, useEffect } from 'react'
import { useDomain } from '../contexts/DomainContext'
import { useDateRangeStore } from '../stores/useDateRangeStore'
import { FeatureGate } from '../components/FeatureGate'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { DateRangePicker } from '../components/ui/date-range-picker'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../components/ui/chart'
import { ShieldAlert, DollarSign, AlertTriangle, TrendingDown, Plus, Trash2, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts'

interface FraudSummary {
  total_clicks: number
  invalid_clicks: number
  invalid_rate: number
  wasted_spend: number
  datacenter_traffic: number
  suspicious_sessions: number
}

interface SourceQuality {
  source: string
  medium: string
  quality_score: number
  clicks: number
  invalid_clicks: number
  human_rate: number
}

interface Campaign {
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

const qualityChartConfig = {
  quality_score: {
    label: 'Quality Score',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

function getQualityColor(score: number): string {
  if (score >= 80) return 'hsl(142, 71%, 45%)'
  if (score >= 60) return 'hsl(84, 81%, 44%)'
  if (score >= 40) return 'hsl(38, 92%, 50%)'
  if (score >= 20) return 'hsl(25, 95%, 53%)'
  return 'hsl(0, 84%, 60%)'
}

function AdFraudContent() {
  const { selectedDomain } = useDomain()
  const { dateRange, setDateRange } = useDateRangeStore()
  const [fraudData, setFraudData] = useState<FraudSummary | null>(null)
  const [sourceQuality, setSourceQuality] = useState<SourceQuality[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddCampaign, setShowAddCampaign] = useState(false)
  const [newCampaign, setNewCampaign] = useState({ name: '', cpc: '', cpm: '', budget: '' })

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
        } else {
          params.set('days', '7')
        }
        if (domain) {
          params.set('domain', domain)
        }
        const qs = params.toString()

        const [fraudRes, qualityRes, campaignsRes] = await Promise.all([
          fetch(`/api/stats/fraud?${qs}`, { credentials: 'include' }),
          fetch(`/api/sources/quality?${qs}`, { credentials: 'include' }),
          fetch('/api/campaigns', { credentials: 'include' }),
        ])

        if (fraudRes.ok) {
          setFraudData(await fraudRes.json())
        }
        if (qualityRes.ok) {
          setSourceQuality(await qualityRes.json())
        }
        if (campaignsRes.ok) {
          setCampaigns(await campaignsRes.json())
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedDomain, dateRange])

  const handleAddCampaign = async () => {
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newCampaign.name,
          cpc: parseFloat(newCampaign.cpc) || 0,
          cpm: parseFloat(newCampaign.cpm) || 0,
          budget: parseFloat(newCampaign.budget) || 0,
        }),
      })
      if (res.ok) {
        const campaign = await res.json()
        setCampaigns([...campaigns, campaign])
        setShowAddCampaign(false)
        setNewCampaign({ name: '', cpc: '', cpm: '', budget: '' })
      }
    } catch (err) {
      console.error('Failed to create campaign:', err)
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        setCampaigns(campaigns.filter(c => c.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete campaign:', err)
    }
  }

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

  // Prepare chart data
  const chartData = sourceQuality.slice(0, 10).map(s => ({
    ...s,
    fill: getQualityColor(s.quality_score),
  }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7" />
            Ad Fraud Detection
          </h1>
          <p className="text-muted-foreground">Monitor click fraud and protect your ad spend</p>
        </div>
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </div>

      {/* Fraud Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Clicks</p>
                <p className="text-2xl font-bold mt-1">{formatNumber(fraudData?.total_clicks || 0)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invalid Traffic</p>
                <p className="text-2xl font-bold mt-1 text-red-500">
                  {((fraudData?.invalid_rate || 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wasted Spend</p>
                <p className="text-2xl font-bold mt-1 text-orange-500">
                  {formatCurrency(fraudData?.wasted_spend || 0)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datacenter Traffic</p>
                <p className="text-2xl font-bold mt-1">{formatNumber(fraudData?.datacenter_traffic || 0)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source Quality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Traffic Source Quality</CardTitle>
          <CardDescription>Quality scores for your traffic sources (higher is better)</CardDescription>
        </CardHeader>
        <CardContent>
          {sourceQuality.length > 0 ? (
            <div className="space-y-6">
              <ChartContainer config={qualityChartConfig} className="h-[250px] w-full">
                <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="source" width={80} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <ChartTooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Bar dataKey="quality_score" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Source</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Medium</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Clicks</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Invalid</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Human Rate</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceQuality.map((source, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-4 font-medium">{source.source || 'Direct'}</td>
                        <td className="py-3 px-4 text-muted-foreground">{source.medium || '-'}</td>
                        <td className="text-right py-3 px-4 tabular-nums">{formatNumber(source.clicks)}</td>
                        <td className="text-right py-3 px-4 tabular-nums text-red-500">
                          {formatNumber(source.invalid_clicks)}
                        </td>
                        <td className="text-right py-3 px-4 tabular-nums">
                          {((source.human_rate || 0) * 100).toFixed(1)}%
                        </td>
                        <td className="text-right py-3 px-4">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: `${getQualityColor(source.quality_score)}20`,
                              color: getQualityColor(source.quality_score),
                            }}
                          >
                            {source.quality_score}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No traffic source data available yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Campaign Manager */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Campaign Manager</CardTitle>
              <CardDescription>Track ad spend and calculate wasted budget</CardDescription>
            </div>
            <Button onClick={() => setShowAddCampaign(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Campaign
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddCampaign && (
            <div className="mb-6 p-4 border border-border rounded-lg space-y-4 bg-muted/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input
                  placeholder="Campaign Name"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="CPC ($)"
                  value={newCampaign.cpc}
                  onChange={(e) => setNewCampaign({ ...newCampaign, cpc: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="CPM ($)"
                  value={newCampaign.cpm}
                  onChange={(e) => setNewCampaign({ ...newCampaign, cpm: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Budget ($)"
                  value={newCampaign.budget}
                  onChange={(e) => setNewCampaign({ ...newCampaign, budget: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddCampaign} disabled={!newCampaign.name}>
                  Save Campaign
                </Button>
                <Button variant="outline" onClick={() => setShowAddCampaign(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Campaign</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">CPC</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">CPM</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Budget</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{campaign.name}</td>
                      <td className="text-right py-3 px-4 tabular-nums">{formatCurrency(campaign.cpc)}</td>
                      <td className="text-right py-3 px-4 tabular-nums">{formatCurrency(campaign.cpm)}</td>
                      <td className="text-right py-3 px-4 tabular-nums">{formatCurrency(campaign.budget)}</td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/api/campaigns/${campaign.id}/report`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCampaign(campaign.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No campaigns created yet. Add a campaign to track ad spend.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function AdFraud() {
  return (
    <FeatureGate feature="ad_fraud">
      <AdFraudContent />
    </FeatureGate>
  )
}
