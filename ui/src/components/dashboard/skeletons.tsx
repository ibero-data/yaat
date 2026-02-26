import { Card, CardContent, CardHeader } from '../ui/card'
import { Skeleton } from '../ui/skeleton'

export function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64 mt-1" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

export function ProgressListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="text-right space-y-1">
            <Skeleton className="h-4 w-12 ml-auto" />
            <Skeleton className="h-3 w-8 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  )
}
