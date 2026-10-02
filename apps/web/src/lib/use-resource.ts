import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Loads data for a page. `deps` identify the resource (stale data from other deps is never shown);
 * `pollMs` returns an interval while the data says work is still in progress, or null to stop polling.
 */
export function useResource<T>(loader: () => Promise<T>, deps: unknown[], pollMs?: (data: T) => number | null) {
  const key = JSON.stringify(deps)
  const loaderRef = useRef(loader)
  useEffect(() => { loaderRef.current = loader })
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({ key })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(value => value + 1), [])

  useEffect(() => {
    let cancelled = false
    loaderRef.current().then(
      data => { if (!cancelled) setState({ key, data }) },
      (error: Error) => { if (!cancelled) setState(previous => ({ key, error, data: previous.key === key ? previous.data : undefined })) },
    )
    return () => { cancelled = true }
  }, [key, version])

  const current = state.key === key ? state : { key, data: undefined, error: undefined }
  const interval = current.data !== undefined && pollMs ? pollMs(current.data) : null
  useEffect(() => {
    if (!interval) return
    const timer = window.setInterval(reload, interval)
    return () => window.clearInterval(timer)
  }, [interval, reload])
  return { data: current.data, error: current.error, reload }
}
