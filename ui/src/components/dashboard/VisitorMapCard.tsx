import { MapPin } from 'lucide-react'
import { useMapData } from '../../hooks/useAnalyticsQueries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { VisitorMap } from '../VisitorMap'

export function VisitorMapCard() {
  const { data, isLoading } = useMapData()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Visitor Locations</CardTitle>
        </div>
        <CardDescription>Geographic distribution of your visitors</CardDescription>
      </CardHeader>
      <CardContent>
        <VisitorMap data={data ?? []} loading={isLoading} />
      </CardContent>
    </Card>
  )
}
