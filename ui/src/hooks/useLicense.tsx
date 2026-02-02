import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface License {
  tier: 'community' | 'pro' | 'enterprise'
  state: 'valid' | 'expired' | 'tampered' | 'missing'
  features: Record<string, boolean>
  limits: Record<string, number>
  expires_at: string | null
  licensee: string
}

interface LicenseContextType {
  license: License | null
  loading: boolean
  error: Error | null
  hasFeature: (feature: string) => boolean
  getLimit: (limit: string) => number
  uploadLicense: (file: File) => Promise<void>
  removeLicense: () => Promise<void>
  refresh: () => Promise<void>
}

const defaultLicense: License = {
  tier: 'community',
  state: 'missing',
  features: {},
  limits: { max_users: 3, max_retention_days: 7 },
  expires_at: null,
  licensee: '',
}

const LicenseContext = createContext<LicenseContextType | null>(null)

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<License | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchLicense = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/license')
      if (!response.ok) throw new Error('Failed to fetch license')
      const data = await response.json()
      setLicense(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
      setLicense(defaultLicense)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLicense()
  }, [fetchLicense])

  const hasFeature = useCallback(
    (feature: string): boolean => {
      if (!license) return false
      return license.features[feature] ?? false
    },
    [license]
  )

  const getLimit = useCallback(
    (limit: string): number => {
      if (!license) return defaultLicense.limits[limit] ?? 0
      return license.limits[limit] ?? 0
    },
    [license]
  )

  const uploadLicense = useCallback(async (file: File) => {
    const content = await file.text()
    const response = await fetch('/api/license', {
      method: 'POST',
      body: content,
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to upload license')
    }

    const data = await response.json()
    setLicense(data)
  }, [])

  const removeLicense = useCallback(async () => {
    const response = await fetch('/api/license', { method: 'DELETE' })
    if (!response.ok) throw new Error('Failed to remove license')
    const data = await response.json()
    setLicense(data)
  }, [])

  return (
    <LicenseContext.Provider
      value={{
        license,
        loading,
        error,
        hasFeature,
        getLimit,
        uploadLicense,
        removeLicense,
        refresh: fetchLicense,
      }}
    >
      {children}
    </LicenseContext.Provider>
  )
}

export function useLicense() {
  const context = useContext(LicenseContext)
  if (!context) {
    throw new Error('useLicense must be used within LicenseProvider')
  }
  return context
}
