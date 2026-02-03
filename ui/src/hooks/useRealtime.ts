import { useState, useEffect, useCallback } from 'react'

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

export function useRealtime() {
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
  const [eventSource, setEventSource] = useState<EventSource | null>(null)

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
        const data = JSON.parse(event.data)
        if (data.type !== 'connected') {
          setLastEvent(data)
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
  }, [eventSource])

  const disconnect = useCallback(() => {
    if (eventSource) {
      eventSource.close()
      setEventSource(null)
      setConnected(false)
    }
  }, [eventSource])

  useEffect(() => {
    connect()
    return () => {
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
