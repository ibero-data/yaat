import { formatNumber } from '../../lib/utils'

interface ProgressItem {
  label: string
  value: number
  percentage: number
}

export function ProgressList({
  items,
  colorClass = 'bg-primary',
  onItemClick,
}: {
  items: ProgressItem[]
  colorClass?: string
  onItemClick?: (label: string) => void
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div
          key={i}
          className={`space-y-2 ${onItemClick ? 'cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-lg transition-colors' : ''}`}
          onClick={onItemClick ? () => onItemClick(item.label) : undefined}
        >
          <div className="flex items-center justify-between text-sm gap-2">
            <span className="text-foreground truncate flex-1 font-medium">
              {item.label}
            </span>
            <span className="text-muted-foreground tabular-nums shrink-0">
              {formatNumber(item.value)}
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${colorClass} rounded-full transition-all duration-500`}
              style={{ width: `${item.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
