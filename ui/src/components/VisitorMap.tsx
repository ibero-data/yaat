import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { useTheme } from './theme/theme-provider'
import L from 'leaflet'
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

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

function FitBounds({ data }: { data: MapPoint[] }) {
  const map = useMap()

  useEffect(() => {
    if (data.length === 0) return

    const bounds = L.latLngBounds(data.map(p => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }, [map, data])

  return null
}

export function VisitorMap({ data, loading }: VisitorMapProps) {
  const { theme } = useTheme()

  const isDark = theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (loading) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-muted rounded-lg">
        <span className="text-muted-foreground">Loading map...</span>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-muted rounded-lg">
        <span className="text-muted-foreground">No location data available</span>
      </div>
    )
  }

  const maxVisitors = Math.max(...data.map(d => d.visitors), 1)
  const getRadius = (visitors: number) => {
    return Math.max(4, Math.min(20, (visitors / maxVisitors) * 20))
  }

  const tileUrl = isDark ? TILE_URLS.dark : TILE_URLS.light

  return (
    <MapContainer
      key={isDark ? 'dark' : 'light'}
      center={[20, 0]}
      zoom={2}
      className="h-[500px] rounded-lg z-0"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={tileUrl}
      />
      <FitBounds data={data} />
      {data.map((point, i) => (
        <CircleMarker
          key={`${point.lat}-${point.lng}-${i}`}
          center={[point.lat, point.lng]}
          radius={getRadius(point.visitors)}
          fillColor="#3b82f6"
          fillOpacity={0.7}
          stroke={true}
          color="#ffffff"
          weight={1.5}
        >
          <Tooltip>
            <div className="text-xs">
              <p className="font-semibold">
                {point.city || 'Unknown'}{point.city && point.country ? ', ' : ''}{point.country}
              </p>
              <p>{point.visitors.toLocaleString()} visitors</p>
              <p>{point.pageviews.toLocaleString()} pageviews</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
