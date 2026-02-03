import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

interface Domain {
  id: string
  name: string
  domain: string
  site_id: string
  is_active: boolean
  created_at: number
}

interface DomainContextType {
  domains: Domain[]
  selectedDomain: Domain | null
  loading: boolean
  setSelectedDomain: (domain: Domain | null) => void
  refreshDomains: () => Promise<void>
}

const DomainContext = createContext<DomainContextType | null>(null)

export function DomainProvider({ children }: { children: ReactNode }) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshDomains = useCallback(async () => {
    try {
      const response = await fetch('/api/domains', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setDomains(data)

        // Auto-select first domain if none selected - use functional update to avoid stale closure
        if (data.length > 0) {
          setSelectedDomain((current) => {
            if (current) return current  // Already have a selection
            // Check localStorage for previously selected domain
            const storedDomainId = localStorage.getItem('yaat_selected_domain')
            const storedDomain = data.find((d: Domain) => d.id === storedDomainId)
            return storedDomain || data[0]
          })
        }
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshDomains()
  }, []) // Only run on mount

  const handleSetSelectedDomain = useCallback((domain: Domain | null) => {
    setSelectedDomain(domain)
    if (domain) {
      localStorage.setItem('yaat_selected_domain', domain.id)
    } else {
      localStorage.removeItem('yaat_selected_domain')
    }
  }, [])

  return (
    <DomainContext.Provider
      value={{
        domains,
        selectedDomain,
        loading,
        setSelectedDomain: handleSetSelectedDomain,
        refreshDomains,
      }}
    >
      {children}
    </DomainContext.Provider>
  )
}

export function useDomain() {
  const context = useContext(DomainContext)
  if (!context) {
    throw new Error('useDomain must be used within DomainProvider')
  }
  return context
}
