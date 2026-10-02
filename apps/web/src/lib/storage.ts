// localStorage for per-browser conveniences only; it can be unavailable (private mode, blocked site data).

export const LAST_TENANT_KEY = 'crm-last-tenant'

export function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* preference lasts for this page only */ }
}
