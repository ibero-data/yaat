import { Gauge } from 'lucide-react'
import { useVitals } from '../../hooks/useAnalyticsQueries'
import { formatDuration } from '../../lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { FeatureGate, FeatureBadge } from '../FeatureGate'

export function WebVitalsCard() {
  const { data } = useVitals()

  return (
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
          {data ? (
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: 'LCP', value: formatDuration(data.lcp), desc: 'Loading' },
                { label: 'FCP', value: formatDuration(data.fcp), desc: 'First Paint' },
                { label: 'CLS', value: data.cls.toFixed(3), desc: 'Layout Shift' },
                { label: 'TTFB', value: formatDuration(data.ttfb), desc: 'Server' },
                { label: 'INP', value: formatDuration(data.inp), desc: 'Interaction' },
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
  )
}
