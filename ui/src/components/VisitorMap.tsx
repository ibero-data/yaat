import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useTheme } from './theme/theme-provider'
import 'leaflet/dist/leaflet.css'

interface MapPoint {
  city: string
  country: string
  lat: number
  lng: number
  visitors: number
  pageviews: number
}

interface VisitorMapProps {
  data: MapPoint[]
  loading?: boolean
}

export function VisitorMap({ data, loading }: VisitorMapProps) {
  const { theme } = useTheme()

  // Determine if dark mode is active
  const isDark = theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center bg-muted rounded-lg">
        <span className="text-muted-foreground">Loading map...</span>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center bg-muted rounded-lg">
        <span className="text-muted-foreground">No location data available</span>
      </div>
    )
  }

  // Calculate marker radius based on visitor count (min 5, max 25)
  const maxVisitors = Math.max(...data.map(d => d.visitors), 1)
  const getRadius = (visitors: number) => {
    return Math.max(5, Math.min(25, (visitors / maxVisitors) * 25))
  }

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      className={`h-[400px] rounded-lg z-0 ${isDark ? 'map-dark' : ''}`}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {data.map((point, i) => (
          <CircleMarker
            key={`${point.lat}-${point.lng}-${i}`}
            center={[point.lat, point.lng]}
            radius={getRadius(point.visitors)}
            fillColor="hsl(var(--primary))"
            fillOpacity={0.6}
            stroke={true}
            color="hsl(var(--primary))"
            weight={1}
          >
            <Popup>
              <div className="text-sm min-w-[120px]">
                <p className="font-semibold text-foreground">
                  {point.city || 'Unknown'}{point.city && point.country ? ', ' : ''}{point.country}
                </p>
                <p className="text-muted-foreground">{point.visitors} visitors</p>
                <p className="text-muted-foreground">{point.pageviews} pageviews</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
