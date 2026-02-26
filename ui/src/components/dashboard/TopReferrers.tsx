import { useReferrers } from '../../hooks/useAnalyticsQueries'
import { useFilterStore } from '../../stores/useFilterStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ProgressList } from './ProgressList'
import { ProgressListSkeleton } from './skeletons'

export function TopReferrers() {
  const { data, isLoading, isPlaceholderData } = useReferrers()
  const { setFilter } = useFilterStore()

  const items = (data ?? []).slice(0, 8).map((ref) => {
    const maxVisitors = data?.[0]?.visitors || 1
    return {
      label: ref.source || 'Direct / None',
      value: ref.visitors,
      percentage: (ref.visitors / maxVisitors) * 100,
    }
  })

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Top Referrers</CardTitle>
        <CardDescription>Where your visitors come from</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <ProgressListSkeleton />
        ) : (
          <ProgressList
            items={items}
            colorClass="bg-chart-2"
            onItemClick={(label) => {
              if (label !== 'Direct / None') setFilter('referrer', label)
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
