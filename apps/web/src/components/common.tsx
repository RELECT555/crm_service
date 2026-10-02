import { useState, type ReactNode } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
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

export function PageHeader({ crumbs, eyebrow, title, subtitle, actions }: {
  crumbs?: Array<{ label: string; href?: string }>; eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode
}) {
  return (
    <div className="mb-6">
      {crumbs && (
        <nav aria-label="Навигация" className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {crumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {crumb.href ? <a href={crumb.href} className="text-muted-foreground hover:text-foreground">{crumb.label}</a> : <span className="text-foreground">{crumb.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</div>}
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
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
