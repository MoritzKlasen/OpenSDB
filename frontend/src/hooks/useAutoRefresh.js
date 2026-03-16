import { useEffect, useRef, useCallback } from 'react'

export const useAutoRefresh = (fetchFn, options = {}) => {
  const {
    interval = null,
    immediate = true,
    dependencies = [],
  } = options

  const fetchFnRef = useRef(fetchFn)

  useEffect(() => {
    fetchFnRef.current = fetchFn
  }, [fetchFn])

  useEffect(() => {
    if (immediate) {
      fetchFnRef.current()
    }

    if (interval) {
      const timerId = setInterval(() => {
        fetchFnRef.current()
      }, interval)

      return () => clearInterval(timerId)
    }
  }, [interval, immediate])

  return fetchFn
}
