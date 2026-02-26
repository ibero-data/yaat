import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { useDevices } from '../../hooks/useAnalyticsQueries'
import { useFilterStore } from '../../stores/useFilterStore'
import { formatNumber } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { CardSkeleton } from './skeletons'

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
}

export function DevicesCard() {
  const { data, isLoading, isPlaceholderData } = useDevices()
  const { setFilter } = useFilterStore()

  const devices = data ?? []
  const total = devices.reduce((acc, d) => acc + d.visitors, 0)

  return (
    <Card className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Devices</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <CardSkeleton />
        ) : devices.length > 0 ? (
          <div className="space-y-4">
            {devices.map((device, i) => {
              const Icon = DEVICE_ICONS[device.device?.toLowerCase()] || Monitor
              const percentage = total > 0 ? ((device.visitors / total) * 100).toFixed(1) : '0'
              return (
                <div
                  key={i}
                  className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                  onClick={() => setFilter('device', device.device || 'Unknown')}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium capitalize">{device.device || 'Unknown'}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatNumber(device.visitors)}</p>
                    <p className="text-xs text-muted-foreground">{percentage}%</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">No device data yet</p>
        )}
      </CardContent>
    </Card>
  )
}
