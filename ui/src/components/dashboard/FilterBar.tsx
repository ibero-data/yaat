import { Filter, X } from 'lucide-react'
import { useFilterStore } from '../../stores/useFilterStore'
import type { AnalyticsFilters } from '../../lib/types'

export function FilterBar() {
  const { filters, removeFilter, clearFilters } = useFilterStore()
  const hasFilters = Object.keys(filters).length > 0

  if (!hasFilters) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Filtered by:</span>
      {Object.entries(filters).map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
        >
          <span className="capitalize">{key}:</span> {value}
          <button
            onClick={() => removeFilter(key as keyof AnalyticsFilters)}
            className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        onClick={clearFilters}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
      >
        Clear all
      </button>
    </div>
  )
}
