import { getRouteApi, linkOptions } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, ChevronsUpDown, Database, FlaskConical, Info, Sparkles, TrendingUp } from 'lucide-react'
import { api, type ManagerMetrics, type WorkspaceAnalytics } from '@/lib/api'
import { AnimatedNumber, BarList, Legend, MeterBar, MixBar, Tip } from '@/components/charts'
import { SERIES_OTHER, TYPE_SLOTS, typeColor } from '@/lib/chart-colors'
import { Avatar, EmptyState, ErrorNotice, Notice, PageHeader, ProviderMark, StatusBadge } from '@/components/common'
import { Busy, SkeletonBlock, SkeletonText } from '@/components/skeletons'
import { EffortMap, WorkRadar } from '@/components/team-charts'
import { Contribution, TeamRings, WorkMatrix } from '@/components/team-metrics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { actionLabel, formatAgo, formatDateTime, numberFormat, percent } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn, skeletonWidths } from '@/lib/utils'

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })

function money(value: number, currency: string | null): string {
  if (!currency) return compact.format(value)
  try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value) }
  catch { return `${compact.format(value)} ${currency}` }
}

function mixParts(byType: Record<string, number>) {
  const slotted = TYPE_SLOTS.map(type => ({ key: type, label: actionLabel(type), value: byType[type] ?? 0, color: typeColor(type) }))
  const other = Object.entries(byType).filter(([type]) => !TYPE_SLOTS.includes(type)).reduce((sum, [, count]) => sum + count, 0)
  return [...slotted, { key: 'other', label: 'Другое', value: other, color: SERIES_OTHER }]
}

const route = getRouteApi('/tenants/$tenantId/analytics')

export function Analytics() {
  const { tenantId } = route.useParams()
  // Demo mode lives in the URL (`?demo=1`) so it survives reloads and can be linked from the tour and the presentation.
  const demo = route.useSearch({ select: search => !!search.demo })
  const navigate = route.useNavigate()
  const data = useResource(() => (demo ? api.analyticsDemo(tenantId) : api.analytics(tenantId)), [tenantId, demo])
  const tenant = useResource(() => api.tenant(tenantId), [tenantId])
  const name = tenant.data?.tenant.name ?? 'Пространство'
  const setDemo = (on: boolean) => navigate({ search: on ? { demo: true } : {} })
  const current = data.data && !!data.data.demo === demo ? data.data : null
  return (
    <>
      <PageHeader icon={BarChart3} title="Аналитика команды"
        crumbs={[{ label: 'Пространства', link: linkOptions({ to: '/' }) },
          { label: name, link: linkOptions({ to: '/tenants/$tenantId', params: { tenantId } }) }, { label: 'Аналитика' }]}
        subtitle="Результат и работа каждого менеджера рядом — чтобы видеть, кому чего не хватает."
        meta={current && `Рассчитано ${formatDateTime(current.generatedAt)} · версия метрик ${current.metricVersion}`}
        actions={<SourceSwitch demo={demo} onChange={setDemo} />} />
      {demo && (
        <div className="mb-5">
          <Notice tone="progress" title="Демо-режим: вымышленная команда"
            action={<Button variant="outline" className="w-full sm:w-auto" onClick={() => setDemo(false)}><Database />К данным пространства</Button>}>
            Так выглядят метрики на заполненной CRM. Данные пространства не используются и не меняются.
          </Notice>
        </div>
      )}
      {data.error && <ErrorNotice message={errorText(data.error)} onRetry={data.reload} />}
      {!current && !data.error && <DashboardSkeleton />}
      {current && (current.managers.length === 0
        ? (
          <Card data-tour="analytics-empty">
            <EmptyState title="Пока нечего показать"
              action={<Button size="lg" onClick={() => setDemo(true)}><Sparkles />Посмотреть на демо-данных</Button>}>
              Подключите CRM и дождитесь первичной загрузки — показатели появятся автоматически. А пока можно посмотреть, как они выглядят.
            </EmptyState>
          </Card>
        )
        : <Dashboard key={demo ? 'demo' : 'live'} data={current} />)}
    </>
  )
}

/** «Пространство | Демо» — a two-option switch with a sliding thumb. */
function SourceSwitch({ demo, onChange }: { demo: boolean; onChange: (demo: boolean) => void }) {
  const options = [{ value: false, label: 'Пространство', icon: Database }, { value: true, label: 'Демо', icon: FlaskConical }]
  return (
    <div role="radiogroup" aria-label="Источник данных" className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-muted p-0.5" data-tour="analytics-source">
      {options.map(option => (
        <button key={option.label} type="button" role="radio" aria-checked={demo === option.value} onClick={() => onChange(option.value)}
          className={cn('relative flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5',
            demo === option.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {demo === option.value && <motion.span layoutId="analytics-source" className="absolute inset-0 rounded-md bg-card shadow-card ring-1 ring-border"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <option.icon className="relative" /><span className="relative">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

function Dashboard({ data }: { data: WorkspaceAnalytics }) {
  const { team } = data
  const kpis = [
    { label: 'Сделки', value: team.deals, meta: team.dealAmount ? `на ${money(team.dealAmount, data.currency)}` : 'суммы не указаны' },
    { label: 'Действия менеджеров', value: team.work, meta: `выполнено ${percent(team.completionRate)}` },
    { label: 'Действий на сделку', value: team.workPerDeal ?? 0, meta: `медиана: ${numberFormat.format(team.medianWork)} действий на менеджера`,
      format: (v: number) => (team.workPerDeal === null ? '—' : v.toFixed(1).replace('.', ',')) },
    { label: 'Действия по сделкам', value: (team.linkedRate ?? 0) * 100, meta: 'доля действий, привязанных к сделке',
      format: (v: number) => (team.linkedRate === null ? '—' : `${Math.round(v)}%`) },
  ]
  const signals = data.managers.flatMap(manager => manager.signals.map(signal => ({ manager, signal })))
  return (
    <motion.div className="grid min-w-0 grid-cols-1 gap-5" variants={staggerList} initial="hidden" animate="show">
      <motion.div variants={staggerItem} className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="analytics-kpis">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="min-w-0 gap-1 px-4 py-4 sm:px-5">
            <div className="text-[13px] text-muted-foreground">{kpi.label}</div>
            <AnimatedNumber value={kpi.value} format={kpi.format} className="text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]" />
            {/* Two lines reserved: tiles keep one height whatever the text, and the skeleton matches it. */}
            <div className="line-clamp-2 min-h-[2lh] text-xs text-muted-foreground">{kpi.meta}</div>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={staggerItem} className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-semibold">Работа по типам</CardTitle>
            <CardDescription>Все действия команды, включая без ответственного.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={data.workByType.slice(0, 7).map(item => ({ key: item.type, label: actionLabel(item.type), value: item.count,
              hint: `${actionLabel(item.type)}: ${numberFormat.format(item.count)}, выполнено ${percent(item.count ? item.completed / item.count : null)}` }))} />
          </CardContent>
        </Card>
        <Card className="min-w-0 lg:col-span-3" data-tour="analytics-signals">
          <CardHeader>
            <CardTitle className="font-semibold">Слабые места</CardTitle>
            <CardDescription>Сравнение с медианой команды. Это повод для разговора, а не вывод о причинах.</CardDescription>
          </CardHeader>
          <CardContent>
            {signals.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-muted-foreground"><TrendingUp className="size-4 text-success" />Явных просадок не видно.</p>
            ) : (
              <ul className="grid gap-2">
                {signals.slice(0, 8).map(({ manager, signal }) => (
                  <li key={manager.key + signal.code} className="flex gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    {signal.severity === 'warning'
                      ? <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" aria-label="Внимание" />
                      : <Info className="mt-0.5 size-4 flex-none text-info" aria-label="К сведению" />}
                    <div className="min-w-0 text-[13px]">
                      <div><span className="font-medium">{manager.name}</span><span className="text-muted-foreground"> · {signal.title}</span></div>
                      <div className="text-muted-foreground">{signal.detail}</div>
                    </div>
                  </li>
                ))}
                {signals.length > 8 && <li className="px-1 text-xs text-muted-foreground">И ещё {signals.length - 8} — в таблице ниже.</li>}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={staggerItem} className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard card={DEPTH_CARDS.map} tour="analytics-map">
          <EffortMap managers={data.managers} medianWork={data.team.medianWork} medianDeals={data.team.medianDeals} />
        </ChartCard>
        <ChartCard card={DEPTH_CARDS.profile} tour="analytics-profile"><WorkRadar managers={data.managers} /></ChartCard>
      </motion.div>

      <motion.div variants={staggerItem}>
        <ChartCard card={DEPTH_CARDS.rings} tour="analytics-rings"><TeamRings managers={data.managers} medianWork={data.team.medianWork} /></ChartCard>
      </motion.div>

      <motion.div variants={staggerItem} className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard card={DEPTH_CARDS.matrix} tour="analytics-matrix"><WorkMatrix managers={data.managers} /></ChartCard>
        <ChartCard card={DEPTH_CARDS.contribution} tour="analytics-contribution"><Contribution managers={data.managers} /></ChartCard>
      </motion.div>

      <motion.div variants={staggerItem}><Managers data={data} /></motion.div>
      <motion.div variants={staggerItem}><Coverage data={data} /></motion.div>
    </motion.div>
  )
}

type SortKey = 'name' | 'deals' | 'work' | 'completion' | 'perDeal'
const SORTS: Array<{ key: SortKey; label: string; value: (m: ManagerMetrics) => number | string | null }> = [
  { key: 'name', label: 'Менеджер', value: m => m.name },
  { key: 'deals', label: 'Сделки', value: m => m.deals },
  { key: 'work', label: 'Действия', value: m => m.work },
  { key: 'completion', label: 'Выполнено', value: m => m.completionRate },
  { key: 'perDeal', label: 'На сделку', value: m => m.workPerDeal },
]

function sortManagers(managers: ManagerMetrics[], key: SortKey, desc: boolean) {
  const read = SORTS.find(sort => sort.key === key)!.value
  return [...managers].sort((a, b) => {
    const x = read(a), y = read(b)
    // Empty values (no work, no deals) always go last, whatever the direction.
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1
    const order = typeof x === 'string' ? x.localeCompare(String(y), 'ru') : x - (y as number)
    return desc ? -order : order
  })
}

const DEALS_COLOR = 'color-mix(in oklch, var(--foreground) 70%, transparent)'

function Managers({ data }: { data: WorkspaceAnalytics }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'deals', desc: true })
  const maxDeals = Math.max(1, ...data.managers.map(m => m.deals))
  const maxWork = Math.max(1, ...data.managers.map(m => m.work))
  const legend = mixParts({}).map(part => ({ label: part.label, color: part.color }))
  const rows = sortManagers(data.managers, sort.key, sort.desc)
  const toggle = (key: SortKey) => setSort(current => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'name' }))
  const head = (key: SortKey, className?: string) => {
    const on = sort.key === key
    const Icon = on ? (sort.desc ? ArrowDown : ArrowUp) : ChevronsUpDown
    const label = SORTS.find(item => item.key === key)!.label
    return (
      <TableHead className={className} aria-sort={on ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
        <button type="button" onClick={() => toggle(key)}
          className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            on && 'text-foreground', className?.includes('text-right') && 'flex-row-reverse')}>
          {label}<Icon className={cn('size-3', !on && 'opacity-50')} aria-hidden="true" />
        </button>
      </TableHead>
    )
  }
  return (
    <Card className="gap-0 pb-0" data-tour="analytics-managers">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">Менеджеры</CardTitle>
        <CardDescription>Полосы — относительно лидера команды, риска — медиана. Структура работы — доли типов действий.</CardDescription>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-2">
          <Legend items={legend} />
          {/* Phones and tablets have no column headers: the same sort as a compact switch. */}
          <div className="flex flex-wrap items-center gap-1 xl:hidden" role="group" aria-label="Сортировка">
            {SORTS.filter(item => item.key !== 'name').map(item => (
              <button key={item.key} type="button" onClick={() => toggle(item.key)} aria-pressed={sort.key === item.key}
                className={cn('inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  sort.key === item.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                {item.label}{sort.key === item.key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      {/* Wide desktop: a table (also the accessible table view of the bars). Tablet and phone: cards, the table needs ~1000 px. */}
      <div className="hidden xl:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/30">
              {head('name')}{head('deals', 'w-[17%]')}{head('work', 'w-[15%]')}
              <TableHead className="w-[19%]">Структура работы</TableHead>
              {head('completion', 'w-[11%] text-right')}{head('perDeal', 'w-[10%] text-right')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(manager => (
              <TableRow key={manager.key} className="hover:bg-muted/40">
                <TableCell className="py-3.5"><ManagerName manager={manager} /></TableCell>
                <TableCell>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold tabular-nums">{numberFormat.format(manager.deals)}</span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">{manager.dealAmount ? money(manager.dealAmount, data.currency) : ''}</span>
                  </div>
                  <MeterBar value={manager.deals} max={maxDeals} median={data.team.medianDeals} color={DEALS_COLOR} label="Сделки" />
                </TableCell>
                <TableCell>
                  <div className="mb-1.5 text-[15px] font-semibold tabular-nums">{numberFormat.format(manager.work)}</div>
                  <MeterBar value={manager.work} max={maxWork} median={data.team.medianWork} color="var(--primary)" label="Действия" />
                </TableCell>
                <TableCell><WorkMix manager={manager} /></TableCell>
                <TableCell className="text-right"><Completion manager={manager} /></TableCell>
                <TableCell className="text-right"><PerDeal manager={manager} team={data.team.workPerDeal} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid grid-cols-1 divide-y xl:hidden">
        {rows.map(manager => (
          <li key={manager.key} className="grid min-w-0 grid-cols-1 gap-3.5 px-5 py-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <ManagerName manager={manager} />
              <Completion manager={manager} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Сделки <span className="text-[15px] font-semibold text-foreground tabular-nums">{numberFormat.format(manager.deals)}</span></span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">{manager.dealAmount ? money(manager.dealAmount, data.currency) : ''}</span>
                </div>
                <MeterBar value={manager.deals} max={maxDeals} median={data.team.medianDeals} color={DEALS_COLOR} label="Сделки" />
              </div>
              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">Действия <span className="text-[15px] font-semibold text-foreground tabular-nums">{numberFormat.format(manager.work)}</span></div>
                <MeterBar value={manager.work} max={maxWork} median={data.team.medianWork} color="var(--primary)" label="Действия" />
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
              <WorkMix manager={manager} />
              <PerDeal manager={manager} team={data.team.workPerDeal} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Work mix bar with the dominant type named under it. */
function WorkMix({ manager }: { manager: ManagerMetrics }) {
  const parts = mixParts(manager.workByType)
  const top = [...parts].sort((a, b) => b.value - a.value)[0]
  return (
    <div className="grid min-w-0 gap-1.5">
      <MixBar parts={parts} />
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {manager.work > 0 && top.value > 0 ? (
          <><span className="size-2 flex-none rounded-[3px]" style={{ background: top.color }} aria-hidden="true" />
            <span className="truncate">чаще всего {top.label.toLowerCase()} · {Math.round((top.value / manager.work) * 100)}%</span></>
        ) : 'нет действий'}
      </div>
    </div>
  )
}

/** Completion as a small ring and a percent; the ring turns to the warning color when the low-completion signal fires. */
function Completion({ manager }: { manager: ManagerMetrics }) {
  const rate = manager.completionRate
  const warn = manager.signals.some(signal => signal.code === 'low_completion')
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium tabular-nums">
      <svg viewBox="0 0 20 20" className="size-[18px] flex-none -rotate-90" aria-hidden="true">
        <circle cx={10} cy={10} r={7.5} fill="none" strokeWidth={3} className="stroke-muted" />
        {rate !== null && rate > 0 && (
          <motion.circle cx={10} cy={10} r={7.5} fill="none" strokeWidth={3} strokeLinecap="round" className={warn ? 'stroke-warning' : 'stroke-primary'}
            initial={{ pathLength: 0 }} animate={{ pathLength: rate }} transition={{ type: 'spring', bounce: 0, visualDuration: 0.7 }} />
        )}
      </svg>
      {percent(rate)}
    </span>
  )
}

/** Work per deal, with the team value for reference. */
function PerDeal({ manager, team }: { manager: ManagerMetrics; team: number | null }) {
  const show = (value: number) => String(value).replace('.', ',')
  return (
    <span className="grid justify-items-end text-right">
      <span className="text-[13px] font-medium tabular-nums">{manager.workPerDeal === null ? '—' : show(manager.workPerDeal)}</span>
      <span className="text-[11px] text-muted-foreground">{team === null ? 'на сделку' : `команда ${show(team)}`}</span>
    </span>
  )
}

function ManagerName({ manager }: { manager: ManagerMetrics }) {
  const shown = manager.signals.slice(0, 2)
  const rest = manager.signals.slice(2)
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar name={manager.name} />
      <div className="grid min-w-0 gap-1">
        <div className={cn('truncate text-[13px] leading-7 font-medium', !manager.named && 'text-muted-foreground')}>{manager.name}</div>
        {manager.signals.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1">
            {shown.map(signal => <SignalPill key={signal.code} signal={signal} />)}
            {rest.length > 0 && (
              <Tip content={rest.map(signal => signal.title).join(', ')} className="outline-none">
                <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">+{rest.length}</span>
              </Tip>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SignalPill({ signal }: { signal: ManagerMetrics['signals'][number] }) {
  const warning = signal.severity === 'warning'
  const Icon = warning ? AlertTriangle : Info
  return (
    <Tip content={signal.detail} className="min-w-0 outline-none">
      <span className={cn('inline-flex h-5 max-w-full items-center gap-1 rounded-full px-2 text-[11px] font-medium',
        warning ? 'bg-warning/12 text-warning' : 'bg-info/12 text-info')}>
        <Icon className="size-3 flex-none" aria-label={warning ? 'Внимание' : 'К сведению'} />
        <span className="truncate">{signal.title}</span>
      </span>
    </Tip>
  )
}

function Coverage({ data }: { data: WorkspaceAnalytics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Данные и ограничения</CardTitle>
        <CardDescription>Что вошло в расчёт. Определения метрик — в docs/metrics.md.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ul className="grid min-w-0 grid-cols-1 content-start gap-3">
          {data.demo && <li className="text-[13px] text-muted-foreground">Демо-режим: подключения CRM не используются.</li>}
          {data.connections.map(connection => (
            <li key={connection.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              <ProviderMark provider={connection.provider} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{connection.account}</div>
                <div className="text-xs text-muted-foreground">Синхронизация {formatAgo(connection.lastSync)}</div>
              </div>
              <StatusBadge status={connection.status} />
            </li>
          ))}
        </ul>
        <ul className="grid min-w-0 list-disc gap-1.5 pl-4 text-[13px] text-muted-foreground">
          {data.currency && <li>Суммы в {data.currency}.</li>}
          {data.coverage.notes.map(note => <li key={note}>{note}</li>)}
        </ul>
      </CardContent>
    </Card>
  )
}

const KPI_LABELS = ['Сделки', 'Действия менеджеров', 'Действий на сделку', 'Действия по сделкам']
type ChartCardText = { title: string; description: string }
const DEPTH_CARDS = {
  map: { title: 'Результат × Работа', description: 'По горизонтали — действия, по вертикали — сделки. Пунктир — медианы команды; наведите на менеджера, чтобы увидеть точные значения.' },
  profile: { title: 'Профиль работы', description: 'Типы действий относительно лидера команды по каждому типу и доля выполненного.' },
  rings: { title: 'Кольца менеджеров', description: 'Три кольца на человека: сколько работы, насколько она доведена до конца и насколько связана со сделками.' },
  matrix: { title: 'Матрица работы', description: 'Кто какие действия делает. Чем темнее ячейка, тем ближе к лидеру команды по этому типу.' },
  contribution: { title: 'Вклад в команду', description: 'Доля менеджера в сделках и в работе команды. Отдача выше ×1 — работа превращается в сделки лучше среднего.' },
} satisfies Record<string, ChartCardText>

function ChartCard({ card, tour, children }: { card: ChartCardText; tour?: string; children: ReactNode }) {
  return (
    <Card className="h-full min-w-0" data-tour={tour}>
      <CardHeader>
        <CardTitle className="font-semibold">{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** The dashboard's own layout with placeholders: same cards, titles and line boxes (docs/ui-guidelines.md#loading). */
function DashboardSkeleton() {
  return (
    <Busy label="Считаем показатели" className="grid min-w-0 grid-cols-1 gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI_LABELS.map((label, index) => (
          <Card key={label} className="min-w-0 gap-1 px-4 py-4 sm:px-5">
            <div className="text-[13px] text-muted-foreground">{label}</div>
            <SkeletonText className="text-2xl leading-tight sm:text-[28px]" width={['40%', '55%', '30%', '35%'][index]} />
            <div className="min-h-[2lh] text-xs"><SkeletonText width="70%" /></div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-semibold">Работа по типам</CardTitle>
            <CardDescription>Все действия команды, включая без ответственного.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {['92%', '40%', '22%', '18%', '8%'].map(width => (
                <li key={width} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <SkeletonBlock className="h-8" style={{ width }} />
                  <SkeletonText className="text-[13px]" width="2.2em" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-semibold">Слабые места</CardTitle>
            <CardDescription>Сравнение с медианой команды. Это повод для разговора, а не вывод о причинах.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {skeletonWidths(5, 45).map(width => (
                <li key={width} className="flex gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                  <SkeletonBlock className="mt-0.5 size-4 rounded-full" />
                  <div className="min-w-0 flex-1 text-[13px]">
                    <SkeletonText width={width} /><SkeletonText width="80%" /><SkeletonText className="sm:hidden" width="40%" />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard card={DEPTH_CARDS.map}><EffortMapSkeleton /></ChartCard>
        <ChartCard card={DEPTH_CARDS.profile}><WorkRadarSkeleton /></ChartCard>
      </div>
      <ChartCard card={DEPTH_CARDS.rings}><TeamRingsSkeleton /></ChartCard>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard card={DEPTH_CARDS.matrix}><WorkMatrixSkeleton /></ChartCard>
        <ChartCard card={DEPTH_CARDS.contribution}><ContributionSkeleton /></ChartCard>
      </div>
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">Менеджеры</CardTitle>
          <CardDescription>Полосы — относительно лидера команды, риска — медиана. Структура работы — доли типов действий.</CardDescription>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">{skeletonWidths(6, 10, 6).map((width, index) => <SkeletonText key={index} className="text-xs" width={`${parseInt(width) * 0.5}em`} />)}</div>
            <div className="flex gap-1 xl:hidden">{['5.5rem', '6.5rem', '7rem', '6.5rem'].map(width => <SkeletonBlock key={width} className="h-7 rounded-full" style={{ width }} />)}</div>
          </div>
        </CardHeader>
        <div className="hidden xl:block">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Менеджер</TableHead><TableHead className="w-[17%]">Сделки</TableHead><TableHead className="w-[15%]">Действия</TableHead>
                <TableHead className="w-[19%]">Структура работы</TableHead><TableHead className="w-[11%] text-right">Выполнено</TableHead>
                <TableHead className="w-[10%] text-right">На сделку</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skeletonWidths(5, 30, 25).map(width => (
                <TableRow key={width}>
                  <TableCell className="py-3.5"><div className="flex items-center gap-3"><SkeletonBlock className="size-7 rounded-lg" /><SkeletonText className="flex-1 text-[13px] leading-7" width={width} /></div></TableCell>
                  <TableCell><SkeletonText className="mb-1.5 text-[15px]" width="30%" /><SkeletonBlock className="h-2 rounded-full" /></TableCell>
                  <TableCell><SkeletonText className="mb-1.5 text-[15px]" width="30%" /><SkeletonBlock className="h-2 rounded-full" /></TableCell>
                  <TableCell><SkeletonBlock className="mb-1.5 h-2 rounded-full" /><SkeletonText className="text-xs" width="70%" /></TableCell>
                  <TableCell><SkeletonText className="ml-auto text-[13px]" width="50%" /></TableCell>
                  <TableCell><SkeletonText className="ml-auto text-[13px]" width="35%" /><SkeletonText className="ml-auto text-[11px]" width="70%" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="grid grid-cols-1 divide-y xl:hidden">
          {skeletonWidths(5, 30, 25).map(width => (
            <li key={width} className="grid min-w-0 grid-cols-1 gap-3.5 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3"><SkeletonBlock className="size-7 rounded-lg" /><SkeletonText className="flex-1 text-[13px] leading-7" width={width} /></div>
                <SkeletonText className="text-[13px]" width="3.5rem" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><SkeletonText className="mb-1.5 text-[15px]" width="55%" /><SkeletonBlock className="h-2 rounded-full" /></div>
                <div><SkeletonText className="mb-1.5 text-[15px]" width="55%" /><SkeletonBlock className="h-2 rounded-full" /></div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
                <div><SkeletonBlock className="mb-1.5 h-2 rounded-full" /><SkeletonText className="text-xs" width="60%" /></div>
                <div><SkeletonText className="text-[13px]" width="2rem" /><SkeletonText className="text-[11px]" width="4.5rem" /></div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">Данные и ограничения</CardTitle>
          <CardDescription>Что вошло в расчёт. Определения метрик — в docs/metrics.md.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ul className="grid gap-3">
            {['55%', '45%'].map(width => (
              <li key={width} className="flex items-center gap-3 text-[13px]">
                <SkeletonBlock className="size-9 rounded-lg" />
                <div className="min-w-0 flex-1"><SkeletonText width={width} /><SkeletonText className="text-xs" width="35%" /></div>
                <SkeletonBlock className="h-6 w-28" />
              </li>
            ))}
          </ul>
          <div className="grid content-start gap-1.5 text-[13px]"><SkeletonText width="30%" /><SkeletonText width="90%" /><SkeletonText width="60%" /></div>
        </CardContent>
      </Card>
    </Busy>
  )
}

/** Mirrors EffortMap: axis captions, tick gutters, the plot plane, then the four zone rows. */
function EffortMapSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div /><SkeletonText className="mb-2 text-[11px]" width="35%" />
        <div className="w-7" /><SkeletonBlock className="h-72 rounded-xl sm:h-80" />
        <div /><SkeletonText className="mt-1.5 text-[11px] leading-4" width="100%" />
        <div /><SkeletonText className="mt-1 ml-auto text-[11px]" width="5rem" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{/* Zone labels wrap to two lines in the half-width card (xl), not on wider or narrower layouts. */}
        {[0, 1, 2, 3].map(index => <SkeletonBlock key={index} className="h-10 rounded-lg xl:h-[52px] 2xl:h-10" />)}</div>
    </div>
  )
}

/** Mirrors TeamRings: the ring legend, then one tile per manager (typical five). */
function TeamRingsSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">{['27em', '19em', '20em'].map(width => <SkeletonText key={width} className="text-xs" width={width} />)}</div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {skeletonWidths(6, 60, 25).map(width => (
          <div key={width} className="flex min-w-0 flex-col gap-3 rounded-xl bg-muted/30 p-3 ring-1 ring-border sm:flex-row sm:items-center sm:gap-4 sm:p-3.5 2xl:flex-col 2xl:items-stretch">
            <SkeletonBlock className="mx-auto size-[88px] flex-none rounded-full sm:mx-0 2xl:mx-auto 2xl:size-[104px]" />
            <div className="grid min-w-0 flex-1 gap-2">
              <SkeletonText className="text-[13px]" width={width} />
              <div className="grid gap-1">{[0, 1, 2].map(index => <SkeletonText key={index} className="text-xs" width="100%" />)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mirrors WorkMatrix: the same table geometry with placeholder cells. */
function WorkMatrixSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[20rem] border-separate border-spacing-1 text-[13px] sm:min-w-[30rem]">
          <thead><tr><th className="w-8 sm:w-[26%]" />{[0, 1, 2, 3, 4].map(index => <th key={index} className="pb-1 text-xs"><SkeletonText width="70%" /></th>)}</tr></thead>
          <tbody>
            {skeletonWidths(5, 50, 30).map(width => (
              <tr key={width}>
                <th className="pr-2"><div className="flex items-center gap-2"><SkeletonBlock className="size-5 rounded-md" /><SkeletonText className="hidden flex-1 sm:flex" width={width} /></div></th>
                {[0, 1, 2, 3, 4].map(index => <td key={index} className="p-0"><SkeletonBlock className="h-9 rounded-md" /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SkeletonText className="text-[11px]" width="18rem" />
    </div>
  )
}

/** Mirrors Contribution: legend, one dumbbell row per manager, the percent axis. */
function ContributionSkeleton() {
  return (
    <div className="grid gap-3">
      <SkeletonText className="text-xs" width="70%" />
      <div className="grid gap-1">
        {skeletonWidths(5, 40, 30).map(width => (
          <div key={width} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-3 px-1.5 py-1.5">
            <div className="flex items-center gap-2"><SkeletonBlock className="size-5 rounded-md" /><SkeletonText className="flex-1 text-[13px]" width={width} /></div>
            <SkeletonBlock className="h-1.5 rounded-full" style={{ width }} />
            <SkeletonText className="text-[13px]" width="100%" />
          </div>
        ))}
      </div>
      <SkeletonText className="text-[11px] leading-4" width="100%" />
    </div>
  )
}

/** Mirrors WorkRadar: manager pills, the radar plane, legend and values. */
function WorkRadarSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5">{['3.5rem', '3rem', '3rem', '3.5rem', '3rem', '3.5rem'].map((width, index) => <SkeletonBlock key={index} className="h-7 rounded-full" style={{ width }} />)}</div>
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,170px)]">
        <SkeletonBlock className="mx-auto aspect-[19/14] w-full max-w-[400px] rounded-full opacity-60" />
        <div className="grid content-start gap-3 text-[13px]">
          <div className="grid gap-1.5 text-xs"><SkeletonText width="70%" /><SkeletonText width="60%" /></div>
          <div className="grid gap-1">{Array.from({ length: 6 }, (_, index) => <SkeletonText key={index} width="100%" />)}</div>
          <div className="text-xs"><SkeletonText width="90%" /><SkeletonText width="50%" /></div>
        </div>
      </div>
    </div>
  )
}
