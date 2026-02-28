import { useEffect, useRef, useCallback } from 'react'

export const useWebSocket = (onMessage) => {
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const onMessageRef = useRef(onMessage)

  // Update ref without triggering re-renders
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    const connect = () => {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        // Clear any pending reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const { event: eventType, data } = message
          
          if (onMessageRef.current) {
            onMessageRef.current(eventType, data)
          }
        } catch (err) {
          // Silent fail for malformed messages
        }
      }

      ws.onerror = (error) => {
        // Handle WebSocket errors silently
      }

      ws.onclose = (event) => {
        // Only attempt to reconnect if not a normal close or unauthorized
        if (event.code !== 1000 && event.code !== 4001) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, 3000)
        }
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Component unmounting')
      }
    }
  }, [])

  return wsRef.current
}
