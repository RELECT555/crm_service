import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { ConnectionStatus } from '../api.ts'
import { STATUS } from '../lib.ts'
import { Icon } from './icons.tsx'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  loading?: boolean
  icon?: Parameters<typeof Icon>[0]['name']
}
export function Button({ variant = 'default', size = 'md', loading, icon, children, className = '', disabled, ...rest }: ButtonProps) {
  const classes = ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  const info = STATUS[status] ?? { label: status, tone: 'muted' as const, hint: '' }
  return <span className={`badge tone-${info.tone}`} title={info.hint}>{info.label}</span>
}

export function Badge({ tone = 'muted', children, plain }: { tone?: 'ok' | 'progress' | 'warn' | 'danger' | 'muted'; children: ReactNode; plain?: boolean }) {
  return <span className={`badge tone-${tone}${plain ? ' plain' : ''}`}>{children}</span>
}

export function Card({ title, description, actions, children, flush }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {description && <p className="card-desc">{description}</p>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </header>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  )
}

export function PageHeader({ crumbs, title, subtitle, actions }: {
  crumbs?: Array<{ label: string; href?: string }>; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode
}) {
  return (
    <>
      {crumbs && (
        <nav className="crumbs" aria-label="Навигация">
          {crumbs.map((crumb, index) => (
            <span key={index} className="row" style={{ gap: 8 }}>
              {index > 0 && <span aria-hidden="true">/</span>}
              {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  )
}

export function Field({ label, hint, error, children, htmlFor }: {
  label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay center" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="overlay-head">
          <h2 className="overlay-title">{title}</h2>
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} aria-label="Закрыть" />
        </div>
        <div className="overlay-body">{children}</div>
        {footer && <div className="overlay-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  useEscape(onClose)
  return (
    <div className="overlay right" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="overlay-head">
          <div>
            <h2 className="overlay-title">{title}</h2>
            {subtitle && <p className="card-desc">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} aria-label="Закрыть" />
        </div>
        <div className="overlay-body">{children}</div>
        {footer && <div className="overlay-foot">{footer}</div>}
      </aside>
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card-body" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ width: `${90 - index * 15}%`, marginTop: index ? 14 : 0 }} />
      ))}
    </div>
  )
}

export function ErrorAlert({ title = 'Не удалось загрузить данные', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="alert tone-danger" role="alert">
      <div style={{ flex: 1 }}>
        <p className="alert-title">{title}</p>
        <p>{message}</p>
      </div>
      {onRetry && <Button size="sm" onClick={onRetry} icon="refresh">Повторить</Button>}
    </div>
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
    <div className="copy">
      <input className="input" readOnly value={value} aria-label={label} onFocus={event => event.currentTarget.select()} />
      <Button onClick={copy} icon={copied ? 'check' : 'copy'} aria-label={`Скопировать: ${label}`}>{copied ? 'Скопировано' : 'Копировать'}</Button>
    </div>
  )
}

const MARKS: Record<string, { text: string; color: string }> = {
  bitrix24: { text: 'B24', color: '#1e9bd7' },
  kommo: { text: 'K', color: '#3a6ff7' },
  hubspot: { text: 'HS', color: '#e8613c' },
  pipedrive: { text: 'P', color: '#1a7f4b' },
  salesforce: { text: 'SF', color: '#0b8bd6' },
  zoho: { text: 'Z', color: '#d6322c' },
  dynamics: { text: 'D', color: '#2155c4' },
  retailcrm: { text: 'R', color: '#6941c6' },
}
export function ProviderMark({ provider, large }: { provider: string; large?: boolean }) {
  const mark = MARKS[provider] ?? { text: provider.slice(0, 2).toUpperCase(), color: '#475467' }
  return <span className={`mark${large ? ' mark-lg' : ''}`} style={{ background: mark.color }} aria-hidden="true">{mark.text}</span>
}
