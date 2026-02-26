import { Globe } from 'lucide-react'
import { useGeo } from '../../hooks/useAnalyticsQueries'
import { useFilterStore } from '../../stores/useFilterStore'
import { formatNumber } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { ProgressListSkeleton } from './skeletons'

export function CountriesCard() {
  const { data, isLoading, isPlaceholderData } = useGeo()
  const { setFilter } = useFilterStore()

  const geo = (data ?? []).slice(0, 5)

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Countries</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <ProgressListSkeleton count={3} />
        ) : geo.length > 0 ? (
          <div className="space-y-4">
            {geo.map((g, i) => {
              const maxVisitors = data?.[0]?.visitors || 1
              return (
                <div
                  key={i}
                  className="space-y-2 cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                  onClick={() => setFilter('country', g.country)}
                >
                  <div className="flex items-center justify-between text-sm gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{g.country || 'Unknown'}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">{formatNumber(g.visitors)}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-5 rounded-full transition-all duration-500"
                      style={{ width: `${(g.visitors / maxVisitors) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">No location data yet</p>
        )}
      </CardContent>
    </Card>
  )
}
