import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'

interface DateRangeState {
  dateRange: DateRange | undefined
  selectedPreset: string
  setDateRange: (range: DateRange | undefined) => void
  setPreset: (preset: string) => void
}

const getDefaultRange = (): DateRange => ({
  from: startOfDay(subDays(new Date(), 6)),
  to: endOfDay(new Date()),
})

export const useDateRangeStore = create<DateRangeState>()(
  persist(
    (set) => ({
      dateRange: getDefaultRange(),
      selectedPreset: 'last7days',
      setDateRange: (range) => set({ dateRange: range }),
      setPreset: (preset) => set({ selectedPreset: preset }),
    }),
    {
      name: 'yaat-date-range',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const data = JSON.parse(str)
          if (data.state?.dateRange?.from) {
            data.state.dateRange.from = new Date(data.state.dateRange.from)
          }
          if (data.state?.dateRange?.to) {
            data.state.dateRange.to = new Date(data.state.dateRange.to)
          }
          return data
        },
        setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
