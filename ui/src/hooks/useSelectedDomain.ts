import { useEffect } from 'react'
import { useDomainStore } from '../stores/useDomainStore'
import { useDomains } from './useDomains'
import type { Domain } from '../lib/types'

export function useSelectedDomain() {
  const { data: domains, isLoading } = useDomains()
  const { selectedDomainId, setSelectedDomainId } = useDomainStore()

  // Auto-select first domain if none selected
  useEffect(() => {
    if (!isLoading && domains && domains.length > 0 && !selectedDomainId) {
      setSelectedDomainId(domains[0].id)
    }
  }, [isLoading, domains, selectedDomainId, setSelectedDomainId])

  const selectedDomain: Domain | null =
    domains?.find((d) => d.id === selectedDomainId) ?? null

  return {
    domains: domains ?? [],
    selectedDomain,
    selectedDomainId,
    setSelectedDomainId,
    isLoading,
  }
}
