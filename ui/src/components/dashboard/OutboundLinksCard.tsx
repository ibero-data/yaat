import { Link2 } from 'lucide-react'
import { useOutboundLinks } from '../../hooks/useAnalyticsQueries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ProgressList } from './ProgressList'
import { ProgressListSkeleton } from './skeletons'

export function OutboundLinksCard() {
  const { data, isLoading, isPlaceholderData } = useOutboundLinks()

  const items = (data ?? []).slice(0, 5).map((link) => {
    const maxClicks = data?.[0]?.clicks || 1
    let displayUrl = link.url || 'Unknown'
    if (displayUrl && !displayUrl.startsWith('(') && displayUrl.includes('.')) {
      try {
        const urlObj = new URL(link.url)
        displayUrl = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '')
      } catch { /* keep original */ }
    }
    return {
      label: displayUrl,
      value: link.clicks,
      percentage: (link.clicks / maxClicks) * 100,
    }
  })

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Outbound Links</CardTitle>
        </div>
        <CardDescription>External links clicked by visitors</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? <ProgressListSkeleton count={3} /> : <ProgressList items={items} colorClass="bg-orange-500" />}
      </CardContent>
    </Card>
  )
}
