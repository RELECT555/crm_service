import { useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'crm-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch { return 'system' }
}

/** Mirrors public/theme-init.js, which applies the same rule before React loads. */
function apply(preference: ThemePreference): void {
  const dark = preference === 'dark' || (preference === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function useTheme(): [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(read)
  useEffect(() => {
    apply(preference)
    if (preference !== 'system') return
    const query = media()
    const onChange = () => apply('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])
  const update = (next: ThemePreference) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage blocked: theme lasts for this page */ }
    setPreference(next)
  }
  return [preference, update]
}
