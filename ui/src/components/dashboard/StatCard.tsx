import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '../ui/card'

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: LucideIcon
  trend?: string
  trendUp?: boolean
}) {
  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md hover:border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold tracking-tight truncate">{value}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {trend && (
                <span className={`flex items-center text-xs font-medium ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {trend}
                </span>
              )}
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function calcTrend(current: number, prev: number | undefined) {
  if (prev === undefined || prev === 0) return { trend: undefined, trendUp: undefined }
  const pct = ((current - prev) / prev) * 100
  return {
    trend: `${Math.abs(pct).toFixed(1)}%`,
    trendUp: pct >= 0,
  }
}
