import { Monitor, Moon, Sun } from 'lucide-react'
import { setTheme, type ThemePreference, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: Array<{ value: ThemePreference; label: string; title: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Светлая', title: 'Светлая тема', icon: Sun },
  { value: 'dark', label: 'Тёмная', title: 'Тёмная тема', icon: Moon },
  { value: 'system', label: 'Авто', title: 'Как в системе', icon: Monitor },
]

/**
 * Light / dark / system switch. `compact` is a single button that always flips the theme you see
 * (light <-> dark), so every click has a visible effect.
 */
export function ThemeSwitch({ compact, className }: { compact?: boolean; className?: string }) {
  const { preference, resolved } = useTheme()
  if (compact) {
    const next = resolved === 'dark' ? 'light' : 'dark'
    const Icon = resolved === 'dark' ? Moon : Sun
    return (
      <button type="button" onClick={() => setTheme(next)} aria-label={next === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему'}
        title={next === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему'}
        className={cn('grid size-9 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none', className)}>
        <Icon key={resolved} className="size-4 animate-enter" />
      </button>
    )
  }
  return (
    <div role="radiogroup" aria-label="Тема оформления" className={cn('grid grid-cols-3 gap-0.5 rounded-lg bg-sidebar-accent p-0.5', className)}>
      {OPTIONS.map(option => {
        const active = preference === option.value
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} title={option.title}
            onClick={() => setTheme(option.value)}
            className={cn('flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-sidebar-muted transition-all duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
              active && 'bg-card text-foreground shadow-card')}>
            <option.icon className={cn('size-3.5', active && 'text-primary')} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
