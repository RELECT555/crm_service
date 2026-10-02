import { useSyncExternalStore } from 'react'

// Hash-based routing, so the backend can serve the build as static files.

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash)
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
}
export function navigate(path: string): void {
  window.location.hash = `#${path}`
}
