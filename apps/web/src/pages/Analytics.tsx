import { motion } from 'motion/react'
import { AlertTriangle, BarChart3, Info, TrendingUp } from 'lucide-react'
import { api, type ManagerMetrics, type WorkspaceAnalytics } from '@/lib/api'
import { AnimatedNumber, BarList, Legend, MeterBar, MixBar } from '@/components/charts'
import { SERIES, SERIES_OTHER } from '@/lib/chart-colors'
import { Avatar, EmptyState, ErrorNotice, LoadingRows, PageHeader, ProviderMark, StatusBadge } from '@/components/common'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { actionLabel, formatAgo, formatDateTime, numberFormat } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

/** Work types get fixed categorical slots (color follows the type, never its rank); the rest fold into «Другое». */
const TYPE_SLOTS = ['call', 'meeting', 'task', 'email', 'visit']
const typeColor = (type: string) => (TYPE_SLOTS.includes(type) ? SERIES[TYPE_SLOTS.indexOf(type)] : SERIES_OTHER)
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)
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

export function Analytics({ tenantId }: { tenantId: string }) {
  const data = useResource(() => api.analytics(tenantId), [tenantId])
  const tenant = useResource(() => api.tenant(tenantId), [tenantId])
  const name = tenant.data?.tenant.name ?? 'Пространство'
  return (
    <>
      <PageHeader icon={BarChart3} title="Аналитика команды"
        crumbs={[{ label: 'Пространства', href: '#/' }, { label: name, href: `#/tenants/${tenantId}` }, { label: 'Аналитика' }]}
        subtitle="Результат и работа каждого менеджера рядом — чтобы видеть, кому чего не хватает."
        meta={data.data && `Рассчитано ${formatDateTime(data.data.generatedAt)} · версия метрик ${data.data.metricVersion}`} />
      {data.error && <ErrorNotice message={errorText(data.error)} onRetry={data.reload} />}
      {!data.data && !data.error && <Card><LoadingRows rows={6} /></Card>}
      {data.data && (data.data.managers.length === 0
        ? <Card data-tour="analytics-empty"><EmptyState title="Пока нечего показать">Подключите CRM и дождитесь первичной загрузки — показатели появятся автоматически.</EmptyState></Card>
        : <Dashboard data={data.data} />)}
    </>
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
            <div className="text-xs text-muted-foreground">{kpi.meta}</div>
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
        <ul className="grid min-w-0 grid-cols-1 gap-3">
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
