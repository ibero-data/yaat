import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const MAX_RETRIES = 10
const BASE_DELAY = 1000
const MAX_DELAY = 60_000

export function useRealtime() {
  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const debounceRef = useRef<number | null>(null)

  const invalidateAnalytics = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    }, 5000)
  }, [queryClient])

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const es = new EventSource('/api/events/stream', { withCredentials: true })
    esRef.current = es

    es.onopen = () => {
      retriesRef.current = 0
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'batch') {
          invalidateAnalytics()
        }
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null

      if (retriesRef.current < MAX_RETRIES) {
        const delay = Math.min(
          BASE_DELAY * Math.pow(2, retriesRef.current) + Math.random() * 1000,
          MAX_DELAY,
        )
        retriesRef.current++
        timerRef.current = window.setTimeout(connect, delay)
      }
    }
  }, [invalidateAnalytics])

  useEffect(() => {
    connect()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [connect])
}
