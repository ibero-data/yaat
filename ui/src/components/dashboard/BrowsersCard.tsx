import { useBrowsers } from '../../hooks/useAnalyticsQueries'
import { useFilterStore } from '../../stores/useFilterStore'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { ProgressList } from './ProgressList'
import { ProgressListSkeleton } from './skeletons'

export function BrowsersCard() {
  const { data, isLoading, isPlaceholderData } = useBrowsers()
  const { setFilter } = useFilterStore()

  const items = (data ?? []).slice(0, 5).map((browser) => {
    const maxVisitors = data?.[0]?.visitors || 1
    return {
      label: browser.browser || 'Unknown',
      value: browser.visitors,
      percentage: (browser.visitors / maxVisitors) * 100,
    }
  })

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Browsers</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <ProgressListSkeleton count={3} />
        ) : (
          <ProgressList
            items={items}
            colorClass="bg-chart-4"
            onItemClick={(label) => setFilter('browser', label)}
          />
        )}
      </CardContent>
    </Card>
  )
}
