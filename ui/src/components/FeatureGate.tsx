import type { ReactNode } from 'react'
import { useLicense } from '../hooks/useLicenseQuery'
import { Lock } from 'lucide-react'

interface FeatureGateProps {
  feature: string
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { hasFeature, license } = useLicense()

  if (hasFeature(feature)) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-3">
          <Lock className="h-6 w-6 text-zinc-500" />
        </div>
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
            Pro Feature
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            This feature requires a {license?.tier === 'community' ? 'Pro or Enterprise' : 'higher'} license.
          </p>
        </div>
        <a
          href="https://yaat.dev/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          Upgrade
        </a>
      </div>
    </div>
  )
}

export function FeatureBadge({ feature }: { feature: string }) {
  const { hasFeature } = useLicense()

  if (hasFeature(feature)) {
    return null
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      PRO
    </span>
  )
}
