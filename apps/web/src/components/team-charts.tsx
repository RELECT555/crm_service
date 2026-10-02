import { useState, type PointerEvent, type ReactNode } from 'react'
import { motion, useReducedMotion, useSpring } from 'motion/react'
import type { ManagerMetrics } from '@/lib/api'
import { actionLabel, numberFormat, percent } from '@/lib/format'
import { niceScale } from '@/lib/chart-scale'
import { cn } from '@/lib/utils'

// Team charts with depth (docs/metrics.md#derived-views, docs/ui-guidelines.md#charts). The data itself stays flat and
// readable — positions, lengths and shapes are never distorted by perspective. Depth is presentation only: the plot
// plane rises into place, marks float on a layer above it, and the plane tilts a few degrees after the pointer.

const spring = { stiffness: 160, damping: 20, mass: 0.6 }

/** A plane that rises into place and tilts after the pointer (≤ `max` degrees). Children may add `Layer`s for depth. */
export function Tilt3D({ children, className, max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion()
  const rotateX = useSpring(0, spring)
  const rotateY = useSpring(0, spring)
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (reduce || event.pointerType !== 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    rotateY.set(((event.clientX - rect.left) / rect.width - 0.5) * max * 2)
    rotateX.set(-((event.clientY - rect.top) / rect.height - 0.5) * max * 2)
  }
  const reset = () => { rotateX.set(0); rotateY.set(0) }
  return (
    <div className={cn('[perspective:1100px]', className)} onPointerMove={move} onPointerLeave={reset}>
      <motion.div className="relative size-full [transform-style:preserve-3d]"
        initial={reduce ? false : { rotateX: 24, y: 24, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}>
        <motion.div className="relative size-full [transform-style:preserve-3d]" style={{ rotateX, rotateY }}>
          {children}
        </motion.div>
      </motion.div>
    </div>
  )
}

/** A layer floating `depth` px above the plane. */
export function Layer({ depth, children, className }: { depth: number; children: ReactNode; className?: string }) {
  return <div className={cn('absolute inset-0 [transform-style:preserve-3d]', className)} style={{ transform: `translateZ(${depth}px)` }}>{children}</div>
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()
const decimal = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')

const ticks = ({ max, step }: { max: number; step: number }) => Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step)

/** Zones of the effort map, in reading order; `high` = at or above the team median on that axis. */
const ZONES = [
  { key: 'both', deals: true, work: true, label: 'Много работы и сделок', cell: 1 },
  { key: 'deals', deals: true, work: false, label: 'Сделки при малой работе', cell: 0 },
  { key: 'work', deals: false, work: true, label: 'Работа без сделок', cell: 3 },
  { key: 'none', deals: false, work: false, label: 'Мало работы и сделок', cell: 2 },
] as const

/** 2×2 glyph naming a zone by its position (top-left, top-right, bottom-left, bottom-right). */
function ZoneGlyph({ cell, strong }: { cell: number; strong?: boolean }) {
  return (
    <span aria-hidden="true" className="grid size-3.5 flex-none grid-cols-2 gap-[2px]">
      {[0, 1, 2, 3].map(index => (
        <span key={index} className={cn('rounded-[1.5px]', index === cell ? (strong ? 'bg-primary' : 'bg-foreground/55') : 'bg-foreground/12')} />
      ))}
    </span>
  )
}

/**
 * «Результат × Работа»: a flat scatter — work on x, deals on y, one avatar per manager. Dashed lines are the team
 * medians; they split the plane into four zones summarized under the plot. Hover or focus a point for a crosshair,
 * exact values on both axes and a card; the other points step back. One series: the title names it.
 */
export function EffortMap({ managers, medianWork, medianDeals }: { managers: ManagerMetrics[]; medianWork: number; medianDeals: number }) {
  const reduce = useReducedMotion()
  const [active, setActive] = useState<string | null>(null)
  const xScale = niceScale(Math.max(...managers.map(m => m.work), medianWork) * 1.06)
  const yScale = niceScale(Math.max(...managers.map(m => m.deals), medianDeals) * 1.1)
  const x = (value: number) => (value / xScale.max) * 100
  const y = (value: number) => 100 - (value / yScale.max) * 100
  const zoneOf = (m: ManagerMetrics) => ZONES.find(zone => zone.deals === m.deals >= medianDeals && zone.work === m.work >= medianWork)!
  const current = managers.find(m => m.key === active) ?? null
  // Tick labels too close to a median label are hidden so the two never overlap.
  const freeX = (value: number) => Math.abs(x(value) - x(medianWork)) > 9 && (!current || Math.abs(x(value) - x(current.work)) > 7)
  const freeY = (value: number) => Math.abs(y(value) - y(medianDeals)) > 9 && (!current || Math.abs(y(value) - y(current.deals)) > 7)
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div />
        <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Сделки</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-foreground/45" />медиана команды</span>
        </div>
        <div className="relative w-7 text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden="true">
          {ticks(yScale).map(value => freeY(value) && (
            <span key={value} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(value)}%` }}>{numberFormat.format(value)}</span>
          ))}
          <span className={cn('absolute right-0 -translate-y-1/2 rounded px-1 font-medium transition-opacity', current ? 'opacity-0' : 'bg-muted text-foreground')}
            style={{ top: `${y(medianDeals)}%` }}>{decimal(medianDeals)}</span>
          {current && (
            <span className="absolute right-0 z-10 -translate-y-1/2 rounded bg-foreground px-1 font-medium text-background" style={{ top: `${y(current.deals)}%` }}>
              {numberFormat.format(current.deals)}</span>
          )}
        </div>
        <div className="relative h-72 rounded-xl bg-muted/30 ring-1 ring-border sm:h-80" onPointerLeave={() => setActive(null)}>
          <div className="absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true">
            <span className="absolute top-0 right-0 bg-primary/[0.07]" style={{ left: `${x(medianWork)}%`, bottom: `${100 - y(medianDeals)}%` }} />
            {ticks(yScale).slice(1, -1).map(value => <span key={`y${value}`} className="absolute inset-x-0 h-px bg-border/70" style={{ top: `${y(value)}%` }} />)}
            {ticks(xScale).slice(1, -1).map(value => <span key={`x${value}`} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${x(value)}%` }} />)}
            <span className="absolute inset-y-0 border-l border-dashed border-foreground/40" style={{ left: `${x(medianWork)}%` }} />
            <span className="absolute inset-x-0 border-t border-dashed border-foreground/40" style={{ top: `${y(medianDeals)}%` }} />
            {current && (
              <>
                <span className="absolute left-0 border-t border-dashed border-primary/70" style={{ top: `${y(current.deals)}%`, width: `${x(current.work)}%` }} />
                <span className="absolute bottom-0 border-l border-dashed border-primary/70" style={{ left: `${x(current.work)}%`, top: `${y(current.deals)}%` }} />
              </>
            )}
          </div>
          {managers.map((manager, index) => {
            const on = active === manager.key
            return (
              <motion.button key={manager.key} type="button" aria-label={`${manager.name}: ${manager.deals} сделок, ${manager.work} действий`}
                className={cn('absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground ring-[3px] ring-card outline-none transition-opacity focus-visible:ring-ring',
                  active && !on && 'opacity-35', on && 'z-20')}
                style={{ boxShadow: '0 6px 16px -6px color-mix(in oklch, var(--primary) 70%, transparent)' }}
                initial={reduce ? false : { left: '0%', top: '100%', opacity: 0, scale: 0.5 }}
                animate={{ left: `${x(manager.work)}%`, top: `${y(manager.deals)}%`, opacity: 1, scale: on ? 1.18 : 1 }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: reduce ? 0 : 0.1 + index * 0.05,
                  scale: { type: 'spring', stiffness: 500, damping: 28 } }}
                onPointerEnter={() => setActive(manager.key)} onFocus={() => setActive(manager.key)} onBlur={() => setActive(null)}
                onClick={() => setActive(on ? null : manager.key)}>
                {initials(manager.name)}
              </motion.button>
            )
          })}
          {current && (
            <motion.div role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }}
              className={cn('pointer-events-none absolute z-30 w-52 rounded-xl bg-card p-3 text-xs text-card-foreground shadow-pop ring-1 ring-border',
                x(current.work) > 55 ? '-translate-x-[calc(100%+22px)]' : 'translate-x-[22px]', y(current.deals) < 35 ? '' : '-translate-y-full')}
              style={{ left: `${x(current.work)}%`, top: `${y(current.deals)}%` }}>
              <div className="mb-2 flex items-center gap-2 font-medium"><ZoneGlyph cell={zoneOf(current).cell} strong={zoneOf(current).key === 'both'} />{current.name}</div>
              <dl className="grid gap-1 text-muted-foreground">
                <div className="flex justify-between gap-3"><dt>Сделки</dt><dd className="font-medium text-foreground tabular-nums">{numberFormat.format(current.deals)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Действия</dt><dd className="font-medium text-foreground tabular-nums">{numberFormat.format(current.work)}</dd></div>
                <div className="flex justify-between gap-3"><dt>На сделку</dt><dd className="font-medium text-foreground tabular-nums">{current.workPerDeal === null ? '—' : decimal(current.workPerDeal)}</dd></div>
              </dl>
              <div className="mt-2 border-t pt-2 text-muted-foreground">{zoneOf(current).label}</div>
            </motion.div>
          )}
        </div>
        <div />
        <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground tabular-nums" aria-hidden="true">
          {ticks(xScale).map((value, index, all) => freeX(value) && (
            <span key={value} className={cn('absolute', index === 0 ? '' : index === all.length - 1 ? '-translate-x-full' : '-translate-x-1/2')}
              style={{ left: `${x(value)}%` }}>{numberFormat.format(value)}</span>
          ))}
          <span className={cn('absolute -translate-x-1/2 rounded px-1 font-medium transition-opacity', current ? 'opacity-0' : 'bg-muted text-foreground')}
            style={{ left: `${x(medianWork)}%` }}>{decimal(medianWork)}</span>
          {current && (
            <span className="absolute z-10 -translate-x-1/2 rounded bg-foreground px-1 font-medium text-background" style={{ left: `${x(current.work)}%` }}>
              {numberFormat.format(current.work)}</span>
          )}
        </div>
        <div />
        <div className="mt-1 text-right text-[11px] font-medium text-foreground/80">Действия →</div>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ZONES.map(zone => {
          const members = managers.filter(m => zoneOf(m).key === zone.key)
          return (
            <li key={zone.key} className={cn('flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ring-1 ring-border',
              zone.key === 'both' ? 'bg-primary/[0.06]' : 'bg-muted/30')}>
              <ZoneGlyph cell={zone.cell} strong={zone.key === 'both'} />
              <span className="min-w-0 flex-1 leading-snug">{zone.label}</span>
              <span className="flex flex-none gap-1">
                {members.slice(0, 4).map(m => (
                  <button key={m.key} type="button" title={m.name} onPointerEnter={() => setActive(m.key)} onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(m.key)} onBlur={() => setActive(null)}
                    className="grid size-6 place-items-center rounded-full bg-card text-[10px] font-semibold ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {initials(m.name)}
                  </button>
                ))}
                {members.length > 4 && <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium">+{members.length - 4}</span>}
                {members.length === 0 && <span className="text-xs text-muted-foreground">никого</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const RADAR_TYPES = ['call', 'meeting', 'task', 'email', 'visit']

type Axis = { key: string; label: string; value: (manager: ManagerMetrics) => number; show: (manager: ManagerMetrics) => string }

function radarAxes(managers: ManagerMetrics[]): Axis[] {
  const typeAxes = RADAR_TYPES.map(type => {
    const max = Math.max(1, ...managers.map(m => m.workByType[type] ?? 0))
    return { key: type, label: actionLabel(type), value: (m: ManagerMetrics) => (m.workByType[type] ?? 0) / max,
      show: (m: ManagerMetrics) => numberFormat.format(m.workByType[type] ?? 0) }
  })
  return [...typeAxes, { key: 'completion', label: 'Выполнено', value: m => m.completionRate ?? 0, show: m => percent(m.completionRate) }]
}

const middle = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const at = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2
}

/**
 * «Профиль работы»: one manager against the team median on each work type (scaled to the team maximum of that type)
 * and on completion rate. Two series — the legend names them; the polygon morphs when another manager is picked.
 */
export function WorkRadar({ managers }: { managers: ManagerMetrics[] }) {
  const reduce = useReducedMotion()
  const [selected, setSelected] = useState(managers[0]?.key)
  const manager = managers.find(m => m.key === selected) ?? managers[0]
  const axes = radarAxes(managers)
  const angle = (index: number) => (index / axes.length) * Math.PI * 2 - Math.PI / 2
  const point = (index: number, radius: number) => [Math.cos(angle(index)) * radius * 100, Math.sin(angle(index)) * radius * 100]
  const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${point(index, Math.max(value, 0.03)).map(n => n.toFixed(2)).join(' ')}`).join(' ') + ' Z'
  const mine = axes.map(axis => axis.value(manager))
  const team = axes.map(axis => middle(managers.map(axis.value)))
  const stronger = axes.filter((_, index) => mine[index] > team[index] * 1.2 && mine[index] - team[index] > 0.05).map(axis => axis.label)
  const weaker = axes.filter((_, index) => mine[index] < team[index] * 0.8 && team[index] - mine[index] > 0.05).map(axis => axis.label)
  const morph = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 18 }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Менеджер">
        {managers.map(item => (
          <button key={item.key} type="button" role="radio" aria-checked={item.key === manager.key} onClick={() => setSelected(item.key)}
            className={cn('relative h-7 rounded-full px-2.5 text-[12px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              item.key === manager.key ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            {item.key === manager.key && <motion.span layoutId="radar-pick" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <span className="relative">{item.name.split(/\s+/)[0]}</span>
          </button>
        ))}
      </div>
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,170px)]">
        <Tilt3D className="mx-auto aspect-[19/14] w-full max-w-[400px]" max={7}>
          <svg viewBox="-190 -140 380 280" className="absolute inset-0 size-full overflow-visible" role="img"
            aria-label={`Профиль работы: ${manager.name}`}>
            {[0.25, 0.5, 0.75, 1].map(ring => (
              <path key={ring} d={path(axes.map(() => ring))} className="fill-none stroke-border" strokeWidth={1} />
            ))}
            {axes.map((axis, index) => {
              const [lx, ly] = point(index, 1.2)
              const [ex, ey] = point(index, 1)
              return (
                <g key={axis.key}>
                  <line x1={0} y1={0} x2={ex} y2={ey} className="stroke-border" strokeWidth={1} />
                  <text x={lx} y={ly} dominantBaseline="middle" textAnchor={Math.abs(lx) < 8 ? 'middle' : lx > 0 ? 'start' : 'end'}
                    className="fill-muted-foreground text-[11px]">{axis.label}</text>
                </g>
              )
            })}
          </svg>
          <Layer depth={18}>
            <svg viewBox="-190 -140 380 280" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              <path d={path(team)} className="fill-none stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 4" />
            </svg>
          </Layer>
          <Layer depth={40}>
            <svg viewBox="-190 -140 380 280" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              <motion.path initial={false} animate={{ d: path(mine) }} transition={morph}
                className="fill-primary/15 stroke-primary" strokeWidth={2} strokeLinejoin="round" />
              {mine.map((value, index) => {
                const [cx, cy] = point(index, Math.max(value, 0.03))
                return <motion.circle key={axes[index].key} r={3.5} initial={false} animate={{ cx, cy }} transition={morph} className="fill-primary stroke-card" strokeWidth={2} />
              })}
            </svg>
          </Layer>
        </Tilt3D>
        <div className="grid content-start gap-3 text-[13px]">
          <ul className="grid gap-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span className="h-0.5 w-4 rounded-full bg-primary" />{manager.name}</li>
            <li className="flex items-center gap-2"><span className="w-4 border-t-[1.5px] border-dashed border-muted-foreground" />Медиана команды</li>
          </ul>
          <dl className="grid gap-1">
            {axes.map((axis, index) => (
              <div key={axis.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{axis.label}</dt>
                <dd className="font-medium tabular-nums">
                  {axis.show(manager)}<span className="sr-only">{mine[index] > team[index] ? ', выше медианы' : ', не выше медианы'}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {stronger.length ? <>Сильнее команды: <span className="text-foreground">{stronger.join(', ').toLowerCase()}</span>. </> : null}
            {weaker.length ? <>Слабее: <span className="text-foreground">{weaker.join(', ').toLowerCase()}</span>.</> : null}
            {!stronger.length && !weaker.length && 'Профиль близок к медиане команды.'}
          </p>
        </div>
      </div>
    </div>
  )
}
