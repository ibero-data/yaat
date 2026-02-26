import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DomainStore {
  selectedDomainId: string | null
  setSelectedDomainId: (id: string | null) => void
}

export const useDomainStore = create<DomainStore>()(
  persist(
    (set) => ({
      selectedDomainId: null,
      setSelectedDomainId: (id) => set({ selectedDomainId: id }),
    }),
    {
      name: 'yaat_selected_domain',
    },
  ),
)
