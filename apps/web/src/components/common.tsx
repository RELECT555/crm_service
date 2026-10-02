import { useState, type ComponentType, type ReactNode } from 'react'
import { Check, Copy, House, RefreshCw, type LucideIcon } from 'lucide-react'
import type { ConnectionStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { STATUS, type Tone } from '@/lib/format'
import { cn } from '@/lib/utils'

// App-level building blocks composed from the shadcn primitives in components/ui.

// Soft tinted pills without borders: color carries meaning, the shape stays quiet.
const TONES: Record<Tone, string> = {
  ok: 'bg-success/10 text-success dark:bg-success/12',
  progress: 'bg-info/10 text-info dark:bg-info/12',
  warn: 'bg-warning/10 text-warning dark:bg-warning/12',
  danger: 'bg-destructive/10 text-destructive dark:bg-destructive/12',
  muted: 'bg-muted text-muted-foreground',
}

/** Small label for categories and directions. Use StatusBadge for connection states. */
export function ToneBadge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap', TONES[tone])}>{children}</span>
}

/** Connection state: a dot plus text. In-progress states get a soft pulsing halo instead of a blinking dot. */
export function StatusBadge({ status }: { status: ConnectionStatus }) {
  const info = STATUS[status] ?? { label: status, tone: 'muted' as const, hint: '' }
  return (
    <span title={info.hint} className={cn('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap', TONES[info.tone])}>
      <span className="relative flex size-1.5">
        {info.tone === 'progress' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {info.label}
    </span>
  )
}

/** Thin progress bar: full when done, a sliding segment while running, empty while waiting. */
export function SyncBar({ state }: { state: 'done' | 'running' | 'waiting' }) {
  return (
    <div className="relative h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted">
      <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-700 ease-out',
        state === 'done' && 'w-full bg-success/80',
        state === 'running' && 'w-2/5 animate-indeterminate bg-primary',
        state === 'waiting' && 'w-0')} />
    </div>
  )
}

/**
 * Breadcrumb trail: a home link, links with a soft hover surface, thin slash separators,
 * and the current page as a quiet chip. Long labels truncate with the full text in a tooltip.
 */
function Breadcrumbs({ trail, lastIsPage }: { trail: Array<{ label: string; href?: string }>; lastIsPage: boolean }) {
  const item = 'inline-flex h-7 max-w-[16rem] min-w-0 items-center rounded-md px-2'
  return (
    <nav aria-label="Навигация" className="-ml-2 mb-4">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px] text-muted-foreground">
        {/* Home link, unless the trail already starts at the home page (Пространства). */}
        {trail[0]?.href !== '#/' && (
          <li className="flex items-center">
            <a href="#/" aria-label="Главная" title="Главная"
              className={cn(item, 'px-1.5 transition-colors hover:bg-muted hover:text-foreground')}>
              <House className="size-[15px]" strokeWidth={1.75} />
            </a>
          </li>
        )}
        {trail.map((crumb, index) => {
          const current = lastIsPage && index === trail.length - 1
          const separated = index > 0 || trail[0]?.href !== '#/'
          return (
            <li key={index} className="flex min-w-0 items-center gap-0.5">
              {separated && <span aria-hidden="true" className="px-0.5 text-muted-foreground/40 select-none">/</span>}
              {crumb.href ? (
                <a href={crumb.href} title={crumb.label}
                  className={cn(item, 'transition-colors hover:bg-muted hover:text-foreground')}>
                  <span className="truncate">{crumb.label}</span>
                </a>
              ) : (
                <span title={crumb.label} aria-current={current ? 'page' : undefined}
                  className={cn(item, current ? 'bg-muted font-medium text-foreground' : 'font-medium text-foreground/80')}>
                  <span className="truncate">{crumb.label}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * The one page header used by every screen: breadcrumb trail (or a section eyebrow), a leading icon tile,
 * title with description, actions on the right, and a hairline separating it from the content.
 */
export function PageHeader({ crumbs, eyebrow, icon: Icon, leading, title, subtitle, meta, actions }: {
  crumbs?: Array<{ label: string; href?: string }>; eyebrow?: string
  /** Page icon rendered in an accent tile; `leading` replaces the tile with custom content (avatar, provider mark). */
  icon?: LucideIcon; leading?: ReactNode
  title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; actions?: ReactNode
}) {
  const trail = crumbs ?? (eyebrow ? [{ label: eyebrow }] : [])
  return (
    <header className="mb-7 border-b border-border pb-6">
      {trail.length > 0 && <Breadcrumbs trail={trail} lastIsPage={Boolean(crumbs)} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
        {leading ?? (Icon && (
          <span className="grid size-11 flex-none place-items-center rounded-xl bg-accent text-primary ring-1 ring-primary/15">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        ))}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight break-words">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[13.5px] text-muted-foreground">{subtitle}</p>}
          {meta && <div className="mt-1 text-[13px] text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex basis-full flex-wrap gap-2 sm:basis-auto">{actions}</div>}
      </div>
    </header>
  )
}

export function Field({ label, hint, error, htmlFor, children }: {
  label: string; hint?: ReactNode; error?: string | null; htmlFor?: string; children: ReactNode
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error
        ? <p role="alert" className="text-[12.5px] text-destructive">{error}</p>
        : hint && <p className="text-[12.5px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center text-muted-foreground">
      <p className="mb-1 text-[15px] font-semibold text-foreground">{title}</p>
      {children && <p className="mx-auto max-w-md">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3.5 p-5" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-3.5" style={{ width: `${90 - index * 15}%` }} />)}
    </div>
  )
}

export function Notice({ tone, title, children, action }: { tone: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex animate-enter flex-wrap items-start gap-3 rounded-xl px-4 py-3', TONES[tone])}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-foreground/80">{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice tone="danger" title="Не удалось загрузить данные"
      action={onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw />Повторить</Button>}>
      {message}
    </Notice>
  )
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked: the value stays selectable in the input */ }
  }
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-[12.5px]" onFocus={event => event.currentTarget.select()} />
      <Button variant="outline" size="lg" onClick={copy} aria-label={`Скопировать: ${label}`}>
        {copied ? <Check /> : <Copy />}{copied ? 'Скопировано' : 'Копировать'}
      </Button>
    </div>
  )
}

const MARKS: Record<string, { text: string; color: string }> = {
  bitrix24: { text: 'B24', color: '#1e9bd7' },
  amocrm: { text: 'amo', color: '#2b8be8' },
  kommo: { text: 'K', color: '#3a6ff7' },
  hubspot: { text: 'HS', color: '#e8613c' },
  pipedrive: { text: 'P', color: '#1a7f4b' },
  salesforce: { text: 'SF', color: '#0b8bd6' },
  zoho: { text: 'Z', color: '#d6322c' },
  dynamics: { text: 'D', color: '#2155c4' },
  retailcrm: { text: 'R', color: '#6941c6' },
}
export function ProviderMark({ provider, large }: { provider: string; large?: boolean }) {
  const mark = MARKS[provider] ?? { text: provider.slice(0, 2).toUpperCase(), color: '#5f5e70' }
  return (
    <span aria-hidden="true" style={{ background: mark.color }}
      className={cn('grid flex-none place-items-center rounded-lg font-bold tracking-tight text-white', large ? 'size-11 text-[15px]' : 'size-9 text-[13px]')}>
      {mark.text}
    </span>
  )
}

export function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold [overflow-wrap:anywhere]" title={title}>{value}</div>
    </div>
  )
}

const AVATAR_STOPWORDS = /^(ооо|ао|зао|пао|ип|llc|inc|ltd|gmbh)$/i

/** Initials avatar for workspaces; color is neutral on purpose (names are not brands). */
export function Avatar({ name, small, large, muted }: { name: string; small?: boolean; large?: boolean; muted?: boolean }) {
  const words = name.replace(/[«»"'()]/g, '').split(/\s+/).filter(word => word && !AVATAR_STOPWORDS.test(word))
  const initials = (words.slice(0, 2).map(word => word[0]).join('') || name.slice(0, 2)).toUpperCase()
  return (
    <span aria-hidden="true" className={cn('grid flex-none place-items-center rounded-lg font-semibold tracking-tight',
      muted ? 'bg-muted text-muted-foreground' : 'bg-foreground/[0.07] text-foreground dark:bg-foreground/10',
      small ? 'size-5 rounded-md text-[9px]' : large ? 'size-12 rounded-xl text-base' : 'size-7 text-[11px]')}>
      {initials}
    </span>
  )
}

/** KPI tile (Tremor-style): label with an icon chip, a large number, one line of context, optional footer (e.g. a bar). */
export function Metric({ icon: Icon, label, value, meta, tone, children, className }: {
  icon: ComponentType<{ className?: string }>; label: string; value: ReactNode; meta?: ReactNode
  tone?: 'danger' | 'ok'; children?: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-xl bg-card p-5 text-card-foreground shadow-card ring-1 ring-border', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13px] text-muted-foreground">{label}</span>
        <span className={cn('grid size-8 flex-none place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4',
          tone === 'danger' && 'bg-destructive/10 text-destructive', tone === 'ok' && 'bg-success/10 text-success')}>
          <Icon />
        </span>
      </div>
      <div className={cn('mt-2 text-[28px] leading-none font-semibold tracking-tight tabular-nums', tone === 'danger' && 'text-destructive')}>{value}</div>
      {meta && <div className="mt-2 truncate text-xs text-muted-foreground">{meta}</div>}
      {children && <div className="mt-auto pt-4">{children}</div>}
    </div>
  )
}

/** Numbered vertical steps joined by a thin line — setup instructions and onboarding flows. */
export function Steps({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ol className={cn('grid gap-0', className)}>
      {items.map((item, index) => (
        <li key={index} className="relative flex gap-3.5 pb-5 last:pb-0">
          {index < items.length - 1 && <span aria-hidden="true" className="absolute top-7 bottom-1 left-[13px] w-px bg-border" />}
          <span className="relative grid size-7 flex-none place-items-center rounded-full bg-card text-[12px] font-semibold text-foreground tabular-nums ring-1 ring-border">
            {index + 1}
          </span>
          <div className="min-w-0 pt-1 text-[13.5px] leading-relaxed">{item}</div>
        </li>
      ))}
    </ol>
  )
}
