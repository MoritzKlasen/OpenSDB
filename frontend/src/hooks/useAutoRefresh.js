import { useEffect, useRef, useCallback } from 'react'

// Custom hook for data fetching with automatic refresh
export const useAutoRefresh = (fetchFn, options = {}) => {
  const {
    interval = null, // null = no polling, number = milliseconds between refetches
    immediate = true, // fetch immediately on mount
    dependencies = [],
  } = options

  const fetchFnRef = useRef(fetchFn)

  // Update ref without triggering effect
  useEffect(() => {
    fetchFnRef.current = fetchFn
  }, [fetchFn])

  // Setup polling - ONLY depends on interval and immediate, not on fetch function
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

  // Return function to manually trigger refetch
  return fetchFn
}

// Custom hook for mutation with automatic refetch
export const useMutationWithRefetch = (mutationFn, onSuccess) => {
  const execute = useCallback(
    async (...args) => {
      try {
        const result = await mutationFn(...args)
        if (onSuccess) {
          await onSuccess(result)
        }
        return result
      } catch (error) {
        console.error('Mutation error:', error)
        throw error
      }
    },
    [mutationFn, onSuccess]
  )

  return execute
}
