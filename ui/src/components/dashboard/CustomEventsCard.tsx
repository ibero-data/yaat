import { Zap } from 'lucide-react'
import { useCustomEvents } from '../../hooks/useAnalyticsQueries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ProgressList } from './ProgressList'
import { ProgressListSkeleton } from './skeletons'

export function CustomEventsCard() {
  const { data, isLoading, isPlaceholderData } = useCustomEvents()

  const items = (data ?? []).slice(0, 5).map((event) => {
    const maxCount = data?.[0]?.count || 1
    return {
      label: event.event_name,
      value: event.count,
      percentage: (event.count / maxCount) * 100,
    }
  })

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Custom Events</CardTitle>
        </div>
        <CardDescription>User interactions and conversions</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? <ProgressListSkeleton count={3} /> : <ProgressList items={items} colorClass="bg-cyan-500" />}
      </CardContent>
    </Card>
  )
}
