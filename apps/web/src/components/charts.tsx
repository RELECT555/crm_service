import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { numberFormat } from '@/lib/format'
import { cn } from '@/lib/utils'

// Lightweight SVG/CSS charts in the Tremor style, built to the dataviz rules (docs/ui-guidelines.md#charts):
// thin marks, 4px rounded data ends, 2px surface gaps, text in text tokens (never series colors), values labeled,
// a hover/focus tooltip on every mark, legends for 2+ series. Colors come only from --series-* tokens.

import { SERIES } from '@/lib/chart-colors'

/** Number that counts up when it scrolls into view (instant under reduced motion via MotionConfig). */
export function AnimatedNumber({ value, format = v => numberFormat.format(Math.round(v)), className }: {
  value: number; format?: (value: number) => string; className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!inView || reduce) return
    const controls = animate(0, value, { duration: 0.8, ease: [0.2, 0.7, 0.2, 1], onUpdate: setShown })
    return () => controls.stop()
  }, [inView, reduce, value])
  return <span ref={ref} className={cn('tabular-nums', className)}>{format(reduce ? value : inView ? shown : 0)}</span>
}

/** Small tooltip shown on hover and keyboard focus of its trigger. */
export function Tip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className={cn('relative', className)} tabIndex={0} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && (
        <motion.span role="tooltip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }}
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-pop">
          {content}
        </motion.span>
      )}
    </span>
  )
}

/** Horizontal ranked bars (Tremor BarList): one series, label left, value right, bar grows from the left. */
export function BarList({ items, color = SERIES[0], valueFormat = (v: number) => numberFormat.format(v) }: {
  items: Array<{ key: string; label: string; value: number; hint?: string }>; color?: string; valueFormat?: (value: number) => string
}) {
  const max = Math.max(1, ...items.map(item => item.value))
  return (
    <ul className="grid gap-2">
      {items.map((item, index) => (
        <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Tip content={item.hint ?? `${item.label}: ${valueFormat(item.value)}`} className="block outline-none">
            <span className="relative flex h-8 items-center overflow-hidden rounded-md">
              <motion.span className="absolute inset-y-0 left-0 rounded-r-[4px] opacity-20" style={{ background: color }}
                initial={{ width: 0 }} animate={{ width: `${(item.value / max) * 100}%` }}
                transition={{ type: 'spring', bounce: 0, visualDuration: 0.6, delay: index * 0.04 }} />
              <span className="relative truncate px-2.5 text-[13px]">{item.label}</span>
            </span>
          </Tip>
          <span className="text-[13px] font-medium tabular-nums">{valueFormat(item.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** 100% stacked bar of parts (Tremor CategoryBar): widths by share, 2px surface gaps, a tooltip per segment. */
export function MixBar({ parts }: { parts: Array<{ key: string; label: string; value: number; color: string }> }) {
  const visible = parts.filter(part => part.value > 0)
  const total = visible.reduce((sum, part) => sum + part.value, 0)
  if (total === 0) return <span className="block h-2 w-full rounded-full bg-muted" />
  return (
    <div className="flex h-2 w-full gap-[2px]" role="img" aria-label={visible.map(part => `${part.label}: ${part.value}`).join(', ')}>
      {visible.map((part, index) => (
        <span key={part.key} className="min-w-[3px]" style={{ flexGrow: part.value, flexBasis: 0 }}>
          <Tip content={`${part.label}: ${numberFormat.format(part.value)} (${Math.round((part.value / total) * 100)}%)`} className="block h-full outline-none">
            <motion.span className={cn('block h-full', index === 0 && 'rounded-l-[4px]', index === visible.length - 1 && 'rounded-r-[4px]')}
              style={{ background: part.color, originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ type: 'spring', bounce: 0, visualDuration: 0.5, delay: index * 0.05 }} />
          </Tip>
        </span>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(item => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[3px]" style={{ background: item.color }} aria-hidden="true" />{item.label}
        </li>
      ))}
    </ul>
  )
}

/** Value bar relative to a maximum, with the team median marked as a thin tick (one series per call). */
export function MeterBar({ value, max, median, color, label }: { value: number; max: number; median?: number; color: string; label: string }) {
  const width = max > 0 ? (value / max) * 100 : 0
  return (
    <Tip content={`${label}: ${numberFormat.format(value)}${median !== undefined ? ` · медиана ${numberFormat.format(Math.round(median * 10) / 10)}` : ''}`}
      className="block outline-none">
      <span className="relative block h-2 rounded-full bg-muted">
        <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }}
          initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ type: 'spring', bounce: 0, visualDuration: 0.6 }} />
        {median !== undefined && max > 0 && (
          <span className="absolute -top-1 -bottom-1 w-px bg-foreground/50" style={{ left: `${Math.min(100, (median / max) * 100)}%` }} aria-hidden="true" />
        )}
      </span>
    </Tip>
  )
}
