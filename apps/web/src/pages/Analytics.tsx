import { getRouteApi, linkOptions } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { AlertTriangle, BarChart3, Database, FlaskConical, Info, Sparkles, TrendingUp } from 'lucide-react'
import { api, type ManagerMetrics, type WorkspaceAnalytics } from '@/lib/api'
import { AnimatedNumber, BarList, Legend, MeterBar, MixBar } from '@/components/charts'
import { SERIES, SERIES_OTHER } from '@/lib/chart-colors'
import { Avatar, EmptyState, ErrorNotice, Notice, PageHeader, ProviderMark, StatusBadge } from '@/components/common'
import { Busy, SkeletonBlock, SkeletonText } from '@/components/skeletons'
import { EffortMap, WorkRadar } from '@/components/team-charts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { actionLabel, formatAgo, formatDateTime, numberFormat, percent } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn, skeletonWidths } from '@/lib/utils'

/** Work types get fixed categorical slots (color follows the type, never its rank); the rest fold into «Другое». */
const TYPE_SLOTS = ['call', 'meeting', 'task', 'email', 'visit']
const typeColor = (type: string) => (TYPE_SLOTS.includes(type) ? SERIES[TYPE_SLOTS.indexOf(type)] : SERIES_OTHER)
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
        <Card className="min-w-0" data-tour="analytics-map">
          <CardHeader>
            <CardTitle className="font-semibold">{DEPTH_CARDS[0].title}</CardTitle>
            <CardDescription>{DEPTH_CARDS[0].description}</CardDescription>
          </CardHeader>
          <CardContent><EffortMap managers={data.managers} medianWork={data.team.medianWork} medianDeals={data.team.medianDeals} /></CardContent>
        </Card>
        <Card className="min-w-0" data-tour="analytics-profile">
          <CardHeader>
            <CardTitle className="font-semibold">{DEPTH_CARDS[1].title}</CardTitle>
            <CardDescription>{DEPTH_CARDS[1].description}</CardDescription>
          </CardHeader>
          <CardContent><WorkRadar managers={data.managers} /></CardContent>
        </Card>
      </motion.div>

      <motion.div variants={staggerItem}><Managers data={data} /></motion.div>
      <motion.div variants={staggerItem}><Coverage data={data} /></motion.div>
    </motion.div>
  )
}

function Managers({ data }: { data: WorkspaceAnalytics }) {
  const maxDeals = Math.max(1, ...data.managers.map(m => m.deals))
  const maxWork = Math.max(1, ...data.managers.map(m => m.work))
  const legend = mixParts({}).map(part => ({ label: part.label, color: part.color }))
  return (
    <Card className="gap-0 pb-0" data-tour="analytics-managers">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">Менеджеры</CardTitle>
        <CardDescription>Полосы сравнивают с лидером команды, вертикальная риска — медиана. Структура работы — доли типов действий.</CardDescription>
        <div className="pt-2"><Legend items={legend} /></div>
      </CardHeader>
      {/* Wide desktop: a table (also the accessible table view of the bars). Tablet and phone: cards, the table needs ~1000 px. */}
      <div className="hidden xl:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Менеджер</TableHead><TableHead className="w-[16%]">Сделки</TableHead><TableHead className="w-[14%]">Действия</TableHead>
              <TableHead className="w-[18%]">Структура работы</TableHead><TableHead className="w-[10%] text-right">Выполнено</TableHead>
              <TableHead className="w-[10%] text-right">На сделку</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.managers.map(manager => (
              <TableRow key={manager.key} className="hover:bg-muted/40">
                <TableCell><ManagerName manager={manager} /></TableCell>
                <TableCell>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium tabular-nums">{numberFormat.format(manager.deals)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{manager.dealAmount ? money(manager.dealAmount, data.currency) : ''}</span>
                  </div>
                  <MeterBar value={manager.deals} max={maxDeals} median={data.team.medianDeals} color="color-mix(in oklch, var(--foreground) 70%, transparent)" label="Сделки" />
                </TableCell>
                <TableCell>
                  <div className="mb-1 text-[13px] font-medium tabular-nums">{numberFormat.format(manager.work)}</div>
                  <MeterBar value={manager.work} max={maxWork} median={data.team.medianWork} color="var(--primary)" label="Действия" />
                </TableCell>
                <TableCell><MixBar parts={mixParts(manager.workByType)} /></TableCell>
                <TableCell className="text-right tabular-nums">{percent(manager.completionRate)}</TableCell>
                <TableCell className="text-right tabular-nums">{manager.workPerDeal === null ? '—' : String(manager.workPerDeal).replace('.', ',')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid grid-cols-1 divide-y xl:hidden">
        {data.managers.map(manager => (
          <li key={manager.key} className="grid min-w-0 grid-cols-1 gap-3 px-5 py-4">
            <ManagerName manager={manager} />
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div><div className="text-xs text-muted-foreground">Сделки</div><div className="mb-1 font-medium tabular-nums">{numberFormat.format(manager.deals)}</div>
                <MeterBar value={manager.deals} max={maxDeals} median={data.team.medianDeals} color="color-mix(in oklch, var(--foreground) 70%, transparent)" label="Сделки" /></div>
              <div><div className="text-xs text-muted-foreground">Действия</div><div className="mb-1 font-medium tabular-nums">{numberFormat.format(manager.work)}</div>
                <MeterBar value={manager.work} max={maxWork} median={data.team.medianWork} color="var(--primary)" label="Действия" /></div>
            </div>
            <MixBar parts={mixParts(manager.workByType)} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Выполнено {percent(manager.completionRate)}</span>
              <span>{manager.workPerDeal === null ? '' : `${String(manager.workPerDeal).replace('.', ',')} действий на сделку`}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ManagerName({ manager }: { manager: ManagerMetrics }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={manager.name} />
      <div className="min-w-0">
        <div className={cn('truncate text-[13px] font-medium', !manager.named && 'text-muted-foreground')}>{manager.name}</div>
        {manager.signals.length > 0 && (
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <AlertTriangle className="size-3 shrink-0 text-warning" aria-hidden="true" />
            <span className="truncate" title={manager.signals.map(signal => signal.title).join(', ')}>
              {manager.signals.map(signal => signal.title.toLowerCase()).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
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
const DEPTH_CARDS = [
  { title: 'Результат × Работа', description: 'Каждая точка — менеджер. Пунктир — медианы команды: они делят карту на четыре зоны.' },
  { title: 'Профиль работы', description: 'Типы действий относительно лидера команды по каждому типу и доля выполненного.' },
]

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
        {DEPTH_CARDS.map(({ title, description }) => (
          <Card key={title} className="min-w-0">
            <CardHeader><CardTitle className="font-semibold">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
            <CardContent>{title === DEPTH_CARDS[0].title ? <EffortMapSkeleton /> : <WorkRadarSkeleton />}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">Менеджеры</CardTitle>
          <CardDescription>Полосы сравнивают с лидером команды, вертикальная риска — медиана. Структура работы — доли типов действий.</CardDescription>
          <div className="flex gap-4 pt-2">{skeletonWidths(6, 10, 6).map((width, index) => <SkeletonText key={index} className="text-xs" width={`${parseInt(width) * 0.5}em`} />)}</div>
        </CardHeader>
        <ul className="grid grid-cols-1 divide-y">
          {skeletonWidths(5, 30, 25).map(width => (
            <li key={width} className="grid min-w-0 grid-cols-1 gap-3 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_16%_14%_18%_10%_10%] xl:items-center xl:gap-8 xl:py-3">
              <div className="flex items-center gap-2.5"><SkeletonBlock className="size-7 rounded-lg" /><SkeletonText className="flex-1 text-[13px]" width={width} /></div>
              <div className="grid grid-cols-2 gap-4 text-[13px] xl:contents">
                <div><SkeletonText className="text-xs xl:hidden" width="40%" /><SkeletonText className="mb-1 font-medium" width="25%" /><SkeletonBlock className="h-2 rounded-full" /></div>
                <div><SkeletonText className="text-xs xl:hidden" width="45%" /><SkeletonText className="mb-1 font-medium" width="25%" /><SkeletonBlock className="h-2 rounded-full" /></div>
              </div>
              <SkeletonBlock className="h-2 rounded-full" />
              <SkeletonText className="text-xs xl:text-right xl:text-sm" width="35%" />
              <SkeletonText className="hidden text-sm xl:flex" width="40%" />
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

/** Mirrors EffortMap: axis caption, the plot plane, axis caption. */
function EffortMapSkeleton() {
  return (
    <div className="grid gap-2">
      <SkeletonText className="text-[11px]" width="30%" />
      <SkeletonBlock className="h-72 rounded-xl sm:h-80" />
      <SkeletonText className="text-[11px]" width="100%" />
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
