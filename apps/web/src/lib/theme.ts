import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

// One module-level store shared by every ThemeSwitch instance, kept in sync across tabs via the
// `storage` event and with the OS via matchMedia. public/theme-init.js applies the same rule before
// React loads so the first paint already has the right theme.

const STORAGE_KEY = 'crm-theme'
const listeners = new Set<() => void>()
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch { return 'system' }
}

let preference = readPreference()

function resolve(value: ThemePreference): ResolvedTheme {
  return value === 'system' ? (media.matches ? 'dark' : 'light') : value
}

function apply(animate: boolean): void {
  const root = document.documentElement
  const dark = resolve(preference) === 'dark'
  if (animate) {
    // Cross-fade colors for one switch only; permanent transitions would slow every hover.
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 300)
  }
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

function emit(): void {
  for (const listener of listeners) listener()
}

media.addEventListener('change', () => {
  if (preference !== 'system') return
  apply(true)
  emit()
})
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return
  preference = readPreference()
  apply(true)
  emit()
})

export function setTheme(next: ThemePreference): void {
  preference = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage blocked: the choice lasts for this page */ }
  apply(true)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current preference and the theme actually shown (system resolved through the OS setting). */
export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme } {
  const current = useSyncExternalStore(subscribe, () => preference)
  const resolved = useSyncExternalStore(subscribe, () => resolve(preference))
  return { preference: current, resolved }
}
