import { Megaphone } from 'lucide-react'
import { useCampaigns } from '../../hooks/useAnalyticsQueries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ProgressList } from './ProgressList'
import { ProgressListSkeleton } from './skeletons'

export function CampaignsCard() {
  const { data, isLoading, isPlaceholderData } = useCampaigns()

  const items = (data ?? []).slice(0, 5).map((campaign) => {
    const maxVisitors = data?.[0]?.visitors || 1
    const label = campaign.utm_campaign && campaign.utm_campaign !== '(none)'
      ? campaign.utm_campaign
      : campaign.utm_source && campaign.utm_source !== '(direct)'
        ? `${campaign.utm_source}${campaign.utm_medium && campaign.utm_medium !== '(none)' ? ' / ' + campaign.utm_medium : ''}`
        : 'Direct Traffic'
    return {
      label,
      value: campaign.visitors,
      percentage: (campaign.visitors / maxVisitors) * 100,
    }
  })

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Campaigns</CardTitle>
        </div>
        <CardDescription>UTM campaign traffic sources</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? <ProgressListSkeleton count={3} /> : <ProgressList items={items} colorClass="bg-pink-500" />}
      </CardContent>
    </Card>
  )
}
