import { useEffect, useRef, useCallback } from 'react'

export const useWebSocket = (onMessage) => {
  const wsRef = useRef(null)

  useEffect(() => {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('✅ WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const { event: eventType, data } = JSON.parse(event.data)
        if (onMessage) {
          onMessage(eventType, data)
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('❌ WebSocket disconnected')
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect WebSocket...')
        // Recursively call useEffect by updating dependency
      }, 3000)
    }

    wsRef.current = ws

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [onMessage])

  return wsRef.current
}
