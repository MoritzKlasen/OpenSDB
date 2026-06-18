import { useEffect, useRef } from 'react'

const PERMANENT_CLOSE_CODES = new Set([
  1000, // normal closure
  4001, // unauthorized (bad/missing token — reconnecting won't help)
  4003, // invalid origin — reconnecting will always fail
])
const MAX_RECONNECT_DELAY_MS = 30000
const MAX_RECONNECT_ATTEMPTS = 10

export const useWebSocket = (onMessage) => {
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    // Local flag captured in the closure; becomes true when the effect cleans up.
    // This prevents reconnect scheduling after unmount and lets us defer closing
    // a socket that is still in CONNECTING state (closing mid-handshake triggers a
    // browser console error; we let onopen fire and close there instead).
    let isCancelled = false

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        if (isCancelled) {
          ws.close(1000, 'Component unmounted')
          return
        }
        reconnectAttemptsRef.current = 0
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      }

      ws.onmessage = (event) => {
        if (isCancelled) return
        try {
          const message = JSON.parse(event.data)
          const { event: eventType, data } = message
          if (onMessageRef.current) {
            onMessageRef.current(eventType, data)
          }
        } catch (err) {
          console.warn('[WS] Failed to parse message:', err)
        }
      }

      ws.onerror = (error) => {
        console.warn('[WS] Connection error:', error)
      }

      ws.onclose = (event) => {
        if (isCancelled) return // unmounting — do not reconnect

        if (PERMANENT_CLOSE_CODES.has(event.code)) return

        const attempt = reconnectAttemptsRef.current
        if (attempt >= MAX_RECONNECT_ATTEMPTS) return

        const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * Math.pow(2, attempt))
        reconnectAttemptsRef.current = attempt + 1
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      isCancelled = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        const state = wsRef.current.readyState
        if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
          wsRef.current.close(1000, 'Component unmounting')
        }
      }
      // If readyState === CONNECTING, onopen will handle the close above.
    }
  }, [])

  return wsRef.current
}
