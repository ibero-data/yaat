import { useRef } from 'react'
import { useLicense, useUploadLicense, useRemoveLicense } from '../hooks/useLicenseQuery'
import { Upload, Trash2, Check, X, Shield, AlertTriangle } from 'lucide-react'

export function LicenseSettings() {
  const { license, isLoading } = useLicense()
  const uploadMutation = useUploadLicense()
  const removeMutation = useRemoveLicense()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMutation.mutate(file, {
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  async function handleRemove() {
    if (!confirm('Are you sure you want to remove the license? You will revert to the Community plan.')) {
      return
    }
    removeMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4 mb-4"></div>
        <div className="h-32 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
      </div>
    )
  }

  const tierColors = {
    community: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
    pro: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    enterprise: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  }

  const stateIcons = {
    valid: <Check className="h-5 w-5 text-green-500" />,
    expired: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    tampered: <X className="h-5 w-5 text-red-500" />,
    missing: <Shield className="h-5 w-5 text-zinc-400" />,
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">License</h2>
        <p className="text-sm text-zinc-500">
          Manage your YAAT  license to unlock premium features.
        </p>
      </div>

      {/* Current license */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {stateIcons[license?.state ?? 'missing']}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                  {license?.tier ?? 'Community'} Plan
                </h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${tierColors[license?.tier ?? 'community']}`}>
                  {license?.state === 'valid' ? 'Active' : license?.state?.toUpperCase()}
                </span>
              </div>
              {license?.licensee && (
                <p className="text-sm text-zinc-500 mt-1">
                  Licensed to: {license.licensee}
                </p>
              )}
              {license?.expires_at && (
                <p className="text-sm text-zinc-500">
                  Expires: {new Date(license.expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {license?.state === 'valid' && (
            <button
              onClick={handleRemove}
              className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
              title="Remove license"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Features */}
        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Features</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(license?.features ?? {}).map(([feature, enabled]) => (
              <div
                key={feature}
                className={`flex items-center gap-2 text-sm ${
                  enabled ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'
                }`}
              >
                {enabled ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Limits */}
        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Limits</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-zinc-500">Max Users</p>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                {license?.limits?.max_users === -1 ? 'Unlimited' : license?.limits?.max_users ?? 3}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Data Retention</p>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                {license?.limits?.max_retention_days === -1
                  ? 'Unlimited'
                  : `${license?.limits?.max_retention_days ?? 7} days`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upload license */}
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6">
        <div className="text-center">
          <Upload className="h-8 w-8 text-zinc-400 mx-auto mb-3" />
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
            {license?.state === 'valid' ? 'Update License' : 'Upload License'}
          </h3>
          <p className="text-sm text-zinc-500 mt-1 mb-4">
            Upload a license.json file to activate premium features.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleUpload}
            className="hidden"
            id="license-upload"
          />
          <label
            htmlFor="license-upload"
            className="inline-flex items-center px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Choose File'}
          </label>
        </div>
      </div>

      {/* Buy license CTA */}
      {license?.tier === 'community' && (
        <div className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white">
          <h3 className="font-medium text-lg">Upgrade to Pro</h3>
          <p className="text-white/80 mt-1">
            Get performance monitoring, error tracking, custom events, data export, and more.
          </p>
          <a
            href="https://yaat.dev/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center px-4 py-2 bg-white text-zinc-900 rounded-md text-sm font-medium hover:bg-zinc-100"
          >
            View Pricing
          </a>
        </div>
      )}
    </div>
  )
}
