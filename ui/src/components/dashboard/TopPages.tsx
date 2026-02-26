import { useTopPages } from '../../hooks/useAnalyticsQueries'
import { useFilterStore } from '../../stores/useFilterStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ProgressList } from './ProgressList'
import { ProgressListSkeleton } from './skeletons'

export function TopPages() {
  const { data, isLoading, isPlaceholderData } = useTopPages()
  const { setFilter } = useFilterStore()

  const items = (data ?? []).slice(0, 8).map((page) => {
    const maxViews = data?.[0]?.views || 1
    return {
      label: page.path || '/',
      value: page.views,
      percentage: (page.views / maxViews) * 100,
    }
  })

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Top Pages</CardTitle>
        <CardDescription>Most visited pages</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <ProgressListSkeleton />
        ) : (
          <ProgressList
            items={items}
            colorClass="bg-chart-1"
            onItemClick={(label) => setFilter('page', label)}
          />
        )}
      </CardContent>
    </Card>
  )
}
