import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, BarChart3, Check, Info, LayoutGrid, Lock, Minus, Plug, Users } from 'lucide-react'
import { BrandMark } from '@/components/Brand'
import { AnimatedNumber, BarList, MeterBar, MixBar } from '@/components/charts'
import { ProviderMark, StatusBadge } from '@/components/common'
import { SERIES } from '@/lib/chart-colors'
import { staggerItem, staggerList } from '@/lib/motion'
import { cn } from '@/lib/utils'

// Product previews for the welcome presentation (docs/onboarding.md#presentation). Each one is built from the same
// components as the real screens, in the current theme, so the presentation shows the product rather than a poster.
// Numbers here are illustrative and never read from customer data.

/** App-window frame that holds a preview; it bleeds off the stage edge like a product shot. */
export function Window({ title, icon: Icon, children, className }: {
  title: string; icon: typeof Plug; children: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex min-w-[460px] flex-col overflow-hidden rounded-xl bg-canvas shadow-pop ring-1 ring-border', className)}>
      <div className="flex h-10 flex-none items-center gap-2.5 border-b bg-card px-3.5">
        <BrandMark size={18} />
        <span className="text-[12px] font-medium text-muted-foreground">CRM Analytics</span>
        <span className="text-[12px] text-muted-foreground/60">/</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><Icon className="size-3.5 text-muted-foreground" />{title}</span>
      </div>
      <motion.div className="grid gap-3 p-4" variants={staggerList} initial="hidden" animate="show">{children}</motion.div>
    </div>
  )
}

const Panel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div variants={staggerItem} className={cn('rounded-lg bg-card p-3.5 shadow-card ring-1 ring-border', className)}>{children}</motion.div>
)

export function OverviewPreview() {
  const kpis = [{ label: 'Сделки', value: 199 }, { label: 'Действия', value: 1538 }, { label: 'Менеджеры', value: 5 }]
  return (
    <Window title="Обзор" icon={LayoutGrid}>
      <div className="grid grid-cols-3 gap-3">
        {kpis.map(kpi => (
          <Panel key={kpi.label}>
            <div className="text-[11px] text-muted-foreground">{kpi.label}</div>
            <AnimatedNumber value={kpi.value} className="mt-1 block text-[22px] leading-none font-semibold tracking-tight" />
          </Panel>
        ))}
      </div>
      <Panel>
        <div className="mb-3 text-[12px] font-medium">Работа по типам</div>
        <BarList items={[
          { key: 'call', label: 'Звонок', value: 980 }, { key: 'task', label: 'Задача', value: 302 },
          { key: 'email', label: 'Письмо', value: 125 }, { key: 'meeting', label: 'Встреча', value: 109 },
        ]} />
      </Panel>
    </Window>
  )
}

export function ConnectPreview() {
  const reduce = useReducedMotion()
  return (
    <Window title="Подключение CRM" icon={Plug}>
      <Panel className="grid gap-2 p-2">
        {[['bitrix24', 'Bitrix24'], ['amocrm', 'amoCRM'], ['kommo', 'Kommo']].map(([id, name], index) => (
          <div key={id} className={cn('flex items-center gap-3 rounded-md px-2 py-1.5', index === 0 && 'bg-muted')}>
            <ProviderMark provider={id} />
            <span className="flex-1 text-[13px] font-medium">{name}</span>
            {index === 0 && <Check className="size-4 text-primary" />}
          </div>
        ))}
      </Panel>
      <Panel>
        <div className="flex items-center gap-3">
          <ProviderMark provider="bitrix24" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">company.bitrix24.ru</div>
            <div className="mt-1"><StatusBadge status="backfilling" /></div>
          </div>
        </div>
        <div className="mt-3.5 grid gap-1.5">
          {['Сделки', 'Дела', 'Пользователи'].map((kind, index) => (
            <div key={kind} className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 text-[12px] text-muted-foreground">
              {kind}
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-primary" initial={reduce ? false : { width: '0%' }}
                  animate={{ width: ['100%', '72%', '35%'][index] }} transition={{ duration: 1.6, delay: 0.5 + index * 0.2, ease: [0.2, 0.7, 0.2, 1] }} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <motion.div variants={staggerItem} className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Lock className="size-3.5" />Только чтение — в CRM ничего не меняется
      </motion.div>
    </Window>
  )
}

const MIX = (values: number[]) => ['Звонок', 'Встреча', 'Задача', 'Письмо', 'Визит']
  .map((label, index) => ({ key: label, label, value: values[index], color: SERIES[index] }))

const MANAGERS = [
  { initials: 'АС', name: 'Анна Соколова', deals: 64, work: 418, mix: MIX([220, 48, 90, 60, 0]) },
  { initials: 'ГО', name: 'Глеб Орлов', deals: 41, work: 292, mix: MIX([180, 30, 60, 0, 22]) },
  { initials: 'ДМ', name: 'Дарья Миронова', deals: 33, work: 275, mix: MIX([140, 25, 70, 40, 0]) },
  { initials: 'БК', name: 'Борис Ким', deals: 9, work: 505, mix: MIX([410, 0, 70, 25, 0]) },
]

export function AnalyticsPreview() {
  return (
    <Window title="Аналитика команды" icon={BarChart3}>
      <Panel className="grid gap-0 p-0">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-3 border-b px-3.5 py-2 text-[11px] text-muted-foreground">
          <span>Менеджер</span><span>Сделки</span><span>Действия</span><span>Структура</span>
        </div>
        {MANAGERS.map(manager => (
          <motion.div key={manager.name} variants={staggerItem}
            className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid size-6 flex-none place-items-center rounded-md bg-muted text-[10px] font-semibold">{manager.initials}</span>
              <span className="truncate text-[12px] font-medium">{manager.name}</span>
            </span>
            <span className="grid gap-1"><span className="text-[12px] tabular-nums">{manager.deals}</span>
              <MeterBar value={manager.deals} max={64} median={37} color="color-mix(in oklch, var(--foreground) 70%, transparent)" label="Сделки" /></span>
            <span className="grid gap-1"><span className="text-[12px] tabular-nums">{manager.work}</span>
              <MeterBar value={manager.work} max={505} median={292} color="var(--primary)" label="Действия" /></span>
            <MixBar parts={manager.mix} />
          </motion.div>
        ))}
      </Panel>
    </Window>
  )
}

export function SignalsPreview() {
  const signals = [
    { icon: AlertTriangle, tone: 'text-warning', name: 'Борис Ким', title: 'Нет встреч и визитов', detail: 'У команды в среднем 25 встреч на менеджера.' },
    { icon: Info, tone: 'text-info', name: 'Борис Ким', title: 'Активность не переходит в сделки', detail: '505 действий, но 9 сделок при медиане 41.' },
    { icon: AlertTriangle, tone: 'text-warning', name: 'Вера Лебедева', title: 'Мало активности', detail: '48 действий при медиане команды 292.' },
  ]
  return (
    <Window title="Слабые места" icon={AlertTriangle}>
      {signals.map((signal, index) => (
        <motion.div key={signal.title} variants={staggerItem}
          className={cn('flex gap-3 rounded-lg bg-card px-3.5 py-3 shadow-card ring-1 ring-border', index === 0 && 'ring-2 ring-primary/50')}>
          <signal.icon className={cn('mt-0.5 size-4 flex-none', signal.tone)} />
          <div className="text-[12.5px] leading-snug">
            <span className="font-medium">{signal.name}</span><span className="text-muted-foreground"> · {signal.title}</span>
            <div className="mt-0.5 text-muted-foreground">{signal.detail}</div>
          </div>
        </motion.div>
      ))}
      <motion.div variants={staggerItem} className="text-[12px] text-muted-foreground">Сравнение с медианой команды — повод для разговора, а не вывод о причинах.</motion.div>
    </Window>
  )
}

const ROLE_ROWS = ['Наблюдатель', 'Аналитик', 'Интегратор', 'Администратор', 'Владелец']
const ROLE_COLUMNS = ['Просмотр', 'Аналитика', 'Подключения', 'Пользователи', 'Роли']

export function AccessPreview() {
  return (
    <Window title="Роли и права" icon={Users}>
      <Panel className="p-0">
        <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] gap-2 border-b px-3.5 py-2 text-[10.5px] text-muted-foreground">
          <span>Роль</span>{ROLE_COLUMNS.map(column => <span key={column} className="truncate text-center">{column}</span>)}
        </div>
        {ROLE_ROWS.map((role, row) => (
          <motion.div key={role} variants={staggerItem}
            className="grid grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] items-center gap-2 border-b px-3.5 py-2.5 last:border-b-0">
            <span className="truncate text-[12px] font-medium">{role}</span>
            {ROLE_COLUMNS.map((column, col) => (
              <span key={column} className="grid place-items-center">
                {col <= row /* mirrors BUILTIN_ROLES: each role adds one capability */
                  ? <Check className="size-3.5 text-foreground" /> : <Minus className="size-3.5 text-muted-foreground/40" />}
              </span>
            ))}
          </motion.div>
        ))}
      </Panel>
      <motion.div variants={staggerItem} className="text-[12px] text-muted-foreground">Каждая роль включает предыдущую. Свои роли собираются из отдельных прав.</motion.div>
    </Window>
  )
}
