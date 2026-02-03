import { useState, useEffect, useCallback, useRef } from 'react'

interface RealtimeEvent {
  type: string
  events: number
  performance: number
  errors: number
  timestamp: number
  last_event?: {
    type: string
    path: string
    country: string
  }
}

interface UseRealtimeOptions {
  onNewEvents?: () => void
  debounceMs?: number
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { onNewEvents, debounceMs = 5000 } = options

  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
  const [eventSource, setEventSource] = useState<EventSource | null>(null)
  const debounceTimerRef = useRef<number | null>(null)

  const connect = useCallback(() => {
    if (eventSource) {
      eventSource.close()
    }

    const es = new EventSource('/api/events/stream', { withCredentials: true })

    es.onopen = () => {
      setConnected(true)
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RealtimeEvent
        if (data.type !== 'connected') {
          setLastEvent(data)

          // Debounced callback for data refresh
          if (data.type === 'batch' && onNewEvents) {
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current)
            }
            debounceTimerRef.current = window.setTimeout(() => {
              onNewEvents()
            }, debounceMs)
          }
        }
      } catch (e) {
        console.error('SSE parse error:', e)
      }
    }

    es.onerror = () => {
      setConnected(false)
      es.close()
      // Reconnect after 5 seconds
      setTimeout(connect, 5000)
    }

    setEventSource(es)
  }, [eventSource, onNewEvents, debounceMs])

  const disconnect = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    if (eventSource) {
      eventSource.close()
      setEventSource(null)
      setConnected(false)
    }
  }, [eventSource])

  useEffect(() => {
    connect()
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (eventSource) {
        eventSource.close()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connected,
    lastEvent,
    connect,
    disconnect,
  }
}
