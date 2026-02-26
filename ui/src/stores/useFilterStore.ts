import { create } from 'zustand'
import type { AnalyticsFilters } from '../lib/types'

interface FilterStore {
  filters: AnalyticsFilters
  setFilter: (key: keyof AnalyticsFilters, value: string) => void
  removeFilter: (key: keyof AnalyticsFilters) => void
  clearFilters: () => void
}

export const useFilterStore = create<FilterStore>()((set) => ({
  filters: {},
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  removeFilter: (key) =>
    set((state) => {
      const next = { ...state.filters }
      delete next[key]
      return { filters: next }
    }),
  clearFilters: () => set({ filters: {} }),
}))
