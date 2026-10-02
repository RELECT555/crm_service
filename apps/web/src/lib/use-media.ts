import { useSyncExternalStore } from 'react'

/** Live media-query match, e.g. useMediaQuery('(min-width: 1024px)'). Breakpoints follow Tailwind's md/lg. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    callback => {
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
  )
}
