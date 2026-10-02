import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ManagerMetrics } from '@/lib/api'
import { Avatar } from '@/components/common'
import { Tip } from '@/components/charts'
import { TYPE_SLOTS, typeColor } from '@/lib/chart-colors'
import { niceScale } from '@/lib/chart-scale'
import { actionLabel, numberFormat, percent } from '@/lib/format'
import { cn } from '@/lib/utils'

// Derived team views (docs/metrics.md#derived-views-computed-in-the-browser-no-new-server-metric). Every number here is
// computed from fields of the analytics response; nothing is estimated. Text always carries the exact value.

const decimal = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')
const firstName = (name: string) => name.split(/\s+/)[0] ?? name

/* ---------------------------------------------------------------- rings */

/**
 * Ring colors: the primary violet and two neighbours of it (toward blue and toward magenta). Rings are identified by
 * position and label (outer → inner) as well as hue, and the hues are blends, not the categorical slots that belong
 * to work types on the same page.
 */
const RING_COLORS = ['var(--primary)', 'color-mix(in oklch, var(--primary) 40%, var(--series-1))', 'color-mix(in oklch, var(--primary) 45%, var(--series-5))']

type Ring = { key: string; label: string; value: (m: ManagerMetrics) => number | null; show: (value: number | null) => string; hint: string }

const linkedRate = (m: ManagerMetrics) => (m.work > 0 ? m.linkedWork / m.work : null)

function rings(medianWork: number): Ring[] {
  return [
    { key: 'volume', label: 'Объём', hint: 'действия к медиане команды; круг замыкается на медиане',
      value: m => (medianWork > 0 ? m.work / medianWork : null), show: v => (v === null ? '—' : `×${decimal(v)}`) },
    { key: 'done', label: 'Выполнено', hint: 'доля выполненных действий', value: m => m.completionRate, show: percent },
    { key: 'linked', label: 'По сделкам', hint: 'доля действий, привязанных к сделке', value: linkedRate, show: percent },
  ]
}

const RADII = [42, 31, 20]
const STROKE = 8.5

/** One arc: a muted track and the value on top; values above 1 draw a second lap with a darker cap (≤ 2 laps). */
function Arc({ radius, value, color, delay }: { radius: number; value: number | null; color: string; delay: number }) {
  const reduce = useReducedMotion()
  const first = Math.min(Math.max(value ?? 0, 0), 1)
  const second = Math.min(Math.max((value ?? 0) - 1, 0), 1)
  const spring = (extra = 0) => (reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 60, damping: 16, delay: delay + extra })
  const common = { cx: 50, cy: 50, r: radius, fill: 'none', strokeWidth: STROKE, strokeLinecap: 'round' as const, transform: 'rotate(-90 50 50)' }
  return (
    <g>
      <circle {...common} stroke={color} strokeOpacity={0.14} />
      {first > 0 && <motion.circle {...common} stroke={color} initial={{ pathLength: reduce ? first : 0 }} animate={{ pathLength: first }} transition={spring()} />}
      {second > 0 && (
        <motion.circle {...common} stroke={`color-mix(in oklch, ${color} 78%, var(--foreground))`} initial={{ pathLength: reduce ? second : 0 }}
          animate={{ pathLength: second }} transition={spring(0.5)} style={{ filter: 'drop-shadow(0 0 1.5px rgb(0 0 0 / 0.35))' }} />
      )}
    </g>
  )
}

/**
 * «Кольца менеджеров»: three concentric rings per manager — work volume against the team median (closes at the
 * median, a second lap above it), share of completed work, share of work linked to a deal. Small multiples in team
 * order; the numbers sit beside every ring set.
 */
export function TeamRings({ managers, medianWork }: { managers: ManagerMetrics[]; medianWork: number }) {
  const specs = rings(medianWork)
  return (
    <div className="grid gap-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {specs.map((ring, index) => (
          <li key={ring.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-[2.5px]" style={{ borderColor: RING_COLORS[index] }} aria-hidden="true" />
            <span className="whitespace-nowrap text-foreground/80">{ring.label}</span> — {ring.hint}
          </li>
        ))}
      </ul>
      {/* Phones and very wide screens: compact vertical tiles; in between, the ring beside its numbers. */}
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {managers.map((manager, index) => (
          <li key={manager.key} className="flex min-w-0 flex-col gap-3 rounded-xl bg-muted/30 p-3 ring-1 ring-border sm:flex-row sm:items-center sm:gap-4 sm:p-3.5 2xl:flex-col 2xl:items-stretch">
            <svg viewBox="0 0 100 100" className="mx-auto size-[88px] flex-none sm:mx-0 2xl:mx-auto 2xl:size-[104px]" role="img"
              aria-label={`${manager.name}: ${specs.map(ring => `${ring.label} ${ring.show(ring.value(manager))}`).join(', ')}`}>
              {specs.map((ring, ringIndex) => (
                <Arc key={ring.key} radius={RADII[ringIndex]} value={ring.value(manager)} color={RING_COLORS[ringIndex]} delay={0.15 + index * 0.06 + ringIndex * 0.08} />
              ))}
            </svg>
            <div className="grid min-w-0 flex-1 gap-2">
              <div className="truncate text-[13px] font-medium" title={manager.name}>{manager.name}</div>
              <dl className="grid gap-1 text-xs">
                {specs.map((ring, ringIndex) => (
                  <div key={ring.key} className="flex items-center gap-2">
                    <span className="size-2 flex-none rounded-full" style={{ background: RING_COLORS[ringIndex] }} aria-hidden="true" />
                    <dt className="min-w-0 truncate text-muted-foreground">{ring.label}</dt>
                    <dd className="ml-auto font-medium tabular-nums">{ring.show(ring.value(manager))}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- matrix */

/**
 * «Матрица работы»: managers × work types. Cell shade = the manager's count of that type ÷ the team leader's count of
 * the same type (one hue, light → dark); the number is always printed. Hover a cell to see its rank in the team.
 */
export function WorkMatrix({ managers }: { managers: ManagerMetrics[] }) {
  const reduce = useReducedMotion()
  const [hover, setHover] = useState<{ row: string; col: string } | null>(null)
  const hasOther = managers.some(m => Object.keys(m.workByType).some(type => !TYPE_SLOTS.includes(type)))
  const columns = [...TYPE_SLOTS, ...(hasOther ? ['other'] : [])]
  const count = (m: ManagerMetrics, type: string) => (type === 'other'
    ? Object.entries(m.workByType).filter(([key]) => !TYPE_SLOTS.includes(key)).reduce((sum, [, value]) => sum + value, 0)
    : m.workByType[type] ?? 0)
  const maxOf = Object.fromEntries(columns.map(type => [type, Math.max(0, ...managers.map(m => count(m, type)))]))
  const rankOf = (m: ManagerMetrics, type: string) => 1 + managers.filter(other => count(other, type) > count(m, type)).length
  const label = (type: string) => (type === 'other' ? 'Другое' : actionLabel(type))
  const describe = (m: ManagerMetrics, type: string) => (count(m, type) === 0 ? `${m.name} · ${label(type)}: нет`
    : `${m.name} · ${label(type)}: ${numberFormat.format(count(m, type))} — ${rankOf(m, type)}-е место из ${managers.length}`)
  const hovered = hover ? managers.find(m => m.key === hover.row) : undefined
  return (
    <div className="grid gap-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[20rem] border-separate border-spacing-1 text-[13px] sm:min-w-[30rem]">
          <thead>
            <tr>
              <th className="w-8 sm:w-[26%]" />
              {columns.map(type => (
                <th key={type} scope="col" className={cn('pb-1 text-left text-xs font-medium whitespace-nowrap transition-colors',
                  hover?.col === type ? 'text-foreground' : 'text-muted-foreground')}>
                  <span className="flex items-center gap-1 text-[11px] sm:gap-1.5 sm:text-xs"><span className="size-2 flex-none rounded-[3px]" style={{ background: typeColor(type) }} aria-hidden="true" />{label(type)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {managers.map((manager, row) => (
              <tr key={manager.key}>
                <th scope="row" className={cn('pr-2 text-left font-normal transition-colors', hover?.row === manager.key ? 'text-foreground' : 'text-foreground/80')}>
                  {/* Phones keep the avatar only, so the type columns fit without scrolling. */}
                  <span className="flex min-w-0 items-center gap-2" title={manager.name}><Avatar name={manager.name} small /><span className="hidden truncate sm:inline">{firstName(manager.name)}</span></span>
                </th>
                {columns.map((type, col) => {
                  const value = count(manager, type)
                  const share = maxOf[type] > 0 ? value / maxOf[type] : 0
                  const strong = share > 0.55
                  return (
                    <td key={type} className="p-0">
                      <motion.span tabIndex={0} aria-label={describe(manager, type)}
                          onPointerEnter={() => setHover({ row: manager.key, col: type })} onPointerLeave={() => setHover(null)}
                          onFocus={() => setHover({ row: manager.key, col: type })} onBlur={() => setHover(null)}
                          className={cn('grid h-9 place-items-center rounded-md tabular-nums transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            value === 0 ? 'bg-muted/50 text-muted-foreground' : strong ? 'font-medium text-primary-foreground' : 'text-foreground',
                            hover?.row === manager.key && hover.col === type && 'ring-2 ring-foreground/30')}
                          style={value > 0 ? { background: `color-mix(in oklch, var(--primary) ${Math.round(10 + share * 80)}%, transparent)` } : undefined}
                          initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 24, delay: (row + col) * 0.025 }}>
                          {value === 0 ? '—' : numberFormat.format(value)}
                        </motion.span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span>меньше</span>
          <span className="h-2 w-20 rounded-full" aria-hidden="true"
            style={{ background: 'linear-gradient(90deg, color-mix(in oklch, var(--primary) 10%, transparent), color-mix(in oklch, var(--primary) 90%, transparent))' }} />
          <span>больше</span>
        </span>
        {/* The hovered cell is described here, not in a tooltip: the scroll container would clip one. */}
        <span className={cn('min-w-0 truncate', hovered && 'font-medium text-foreground')} aria-live="polite">
          {hovered && hover ? describe(hovered, hover.col) : 'Наведите на ячейку — покажем место в команде'}
        </span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- contribution */

/**
 * «Вклад в команду»: for each manager, the share of the team's deals and the share of the team's work on one 0–max %
 * axis, joined by a bar (a dumbbell). «Отдача» = deal share ÷ work share: above ×1 the manager's work turns into deals
 * better than the team on average. Sorted by it; managers without work go last.
 */
export function Contribution({ managers }: { managers: ManagerMetrics[] }) {
  const reduce = useReducedMotion()
  const ratio = (m: ManagerMetrics) => (m.workShare > 0 ? m.dealShare / m.workShare : null)
  const rows = [...managers].sort((a, b) => (ratio(b) ?? -1) - (ratio(a) ?? -1))
  const scale = niceScale(Math.max(...managers.map(m => Math.max(m.dealShare, m.workShare))) * 100)
  const at = (share: number) => `${(share * 100 / scale.max) * 100}%`
  const steps = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step)
  const DEAL = 'color-mix(in oklch, var(--foreground) 78%, transparent)'
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: DEAL }} aria-hidden="true" />Доля сделок</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />Доля работы</li>
        <li className="ml-auto">Отдача = сделки ÷ работа</li>
      </ul>
      <ul className="grid gap-1">
        {rows.map((manager, index) => {
          const value = ratio(manager)
          const low = Math.min(manager.dealShare, manager.workShare)
          const high = Math.max(manager.dealShare, manager.workShare)
          const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 120, damping: 20, delay: 0.1 + index * 0.05 }
          return (
            <li key={manager.key}>
              <Tip className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-3 rounded-lg px-1.5 py-1.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                content={`${manager.name}: ${percent(manager.dealShare)} сделок и ${percent(manager.workShare)} работы команды`}>
                <span className="flex min-w-0 items-center gap-2 text-[13px]"><Avatar name={manager.name} small /><span className="truncate">{firstName(manager.name)}</span></span>
                <span className="relative block h-5" aria-hidden="true">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  <motion.span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/15"
                    initial={reduce ? false : { left: '0%', width: '0%' }} animate={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} transition={spring} />
                  <motion.span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                    initial={reduce ? false : { left: '0%' }} animate={{ left: at(manager.workShare) }} transition={spring} />
                  <motion.span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ background: DEAL }}
                    initial={reduce ? false : { left: '0%' }} animate={{ left: at(manager.dealShare) }} transition={spring} />
                </span>
                <span className={cn('text-right text-[13px] font-medium tabular-nums', value !== null && value < 1 && 'text-muted-foreground')}>
                  {value === null ? '—' : `×${decimal(value)}`}
                </span>
              </Tip>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] gap-3 px-1.5 text-[11px] text-muted-foreground tabular-nums" aria-hidden="true">
        <span />
        <span className="relative h-4">
          {steps.map((step, index) => (
            <span key={step} className={cn('absolute', index === 0 ? '' : index === steps.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              index % 2 === 1 && index !== steps.length - 1 && 'hidden sm:inline')}
              style={{ left: `${(step / scale.max) * 100}%` }}>{step}%</span>
          ))}
        </span>
        <span />
      </div>
    </div>
  )
}
