import { Monitor, Moon, Sun } from 'lucide-react'
import { type ThemePreference, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Светлая тема', icon: Sun },
  { value: 'dark', label: 'Тёмная тема', icon: Moon },
  { value: 'system', label: 'Как в системе', icon: Monitor },
]

/** Segmented light/dark/system switch; `compact` collapses it to one button that cycles. */
export function ThemeSwitch({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme()
  if (compact) {
    const index = OPTIONS.findIndex(option => option.value === theme)
    const current = OPTIONS[index]
    const next = OPTIONS[(index + 1) % OPTIONS.length]
    return (
      <button type="button" onClick={() => setTheme(next.value)} title={`${current.label}. Нажмите: ${next.label.toLowerCase()}`}
        className="grid size-9 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-foreground">
        <current.icon className="size-4" />
      </button>
    )
  }
  return (
    <div role="radiogroup" aria-label="Тема оформления" className="grid grid-cols-3 rounded-lg bg-sidebar-accent p-0.5">
      {OPTIONS.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={theme === option.value} title={option.label}
          onClick={() => setTheme(option.value)}
          className={cn('grid h-7 place-items-center rounded-md text-sidebar-muted transition-all duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            theme === option.value && 'bg-card text-foreground shadow-card')}>
          <option.icon className="size-4" />
        </button>
      ))}
    </div>
  )
}
