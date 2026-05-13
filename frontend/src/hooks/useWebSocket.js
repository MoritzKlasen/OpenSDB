import { useEffect, useRef, useCallback } from 'react'

export const useWebSocket = (onMessage) => {
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
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
        } catch (err) {}
      }

      ws.onerror = (error) => {}

      ws.onclose = (event) => {
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
      if (wsRef.current) {
        const state = wsRef.current.readyState
        if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
          wsRef.current.close(1000, 'Component unmounting')
        }
      }
    }
  }, [])

  return wsRef.current
}
