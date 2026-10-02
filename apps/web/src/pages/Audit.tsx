import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { History, KeyRound, Layers, ListFilter, Loader2, LogIn, Plug, ShieldAlert, Tags, Trash2, UserCog, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { api, type AuditEntry } from '@/lib/api'
import { Avatar, EmptyState, ErrorNotice, PageHeader } from '@/components/common'
import { Busy, SkeletonBlock, SkeletonText } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { numberFormat, plural } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'
import type { AuditFilter } from '@/router'

/** Russian labels for audit actions; keep in sync with docs/access-control.md#audit-log. */
const ACTIONS: Record<string, string> = {
  'auth.login': 'Вход', 'auth.login_failed': 'Неудачный вход', 'user.bootstrap_owner': 'Создан первый владелец',
  'user.create': 'Создан пользователь', 'user.update': 'Изменён пользователь', 'user.delete': 'Удалён пользователь',
  'user.password_changed': 'Смена своего пароля', 'role.create': 'Создана роль', 'role.update': 'Изменена роль', 'role.delete': 'Удалена роль',
  'workspace.create': 'Создано пространство', 'workspace.update': 'Изменено пространство',
  'connection.connected': 'Подключена CRM', 'connection.reauthorized': 'Переавторизация CRM', 'connection.resync': 'Полная синхронизация',
  'connection.disconnect': 'Подключение отключено', 'connection.resume': 'Подключение возобновлено',
  'mapping.commercial_set': 'Разметка процесса', 'mapping.commercial_delete': 'Разметка процесса удалена',
  'mapping.action_set': 'Сопоставлен тип действия', 'mapping.action_delete': 'Удалено сопоставление типа',
}
const DANGER = new Set(['auth.login_failed', 'user.delete', 'role.delete', 'connection.disconnect'])

/** Filter chips; `type` is the server-side group list (`GET /v1/audit?type=`). */
const FILTERS: Array<{ id: AuditFilter | undefined; label: string; type?: string }> = [
  { id: undefined, label: 'Все события' },
  { id: 'auth', label: 'Входы', type: 'auth' },
  { id: 'people', label: 'Люди и роли', type: 'user,role' },
  { id: 'workspace', label: 'Пространства', type: 'workspace' },
  { id: 'connection', label: 'Подключения', type: 'connection' },
  { id: 'mapping', label: 'Разметка', type: 'mapping' },
]
const GROUP_ICONS: Record<string, LucideIcon> = { auth: LogIn, user: UserCog, role: KeyRound, workspace: Layers, connection: Plug, mapping: Tags }

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const fullFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'medium' })

function dayLabel(at: number): string {
  const day = new Date(at).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  if (day === today) return 'Сегодня'
  if (day === today - 86_400_000) return 'Вчера'
  return dayFormat.format(at)
}

function EventIcon({ action }: { action: string }) {
  if (action === 'auth.login_failed') return <ShieldAlert aria-hidden="true" />
  if (DANGER.has(action)) return <Trash2 aria-hidden="true" />
  const Icon = GROUP_ICONS[action.split('.')[0]] ?? History
  return <Icon aria-hidden="true" />
}

function summary(entry: AuditEntry): string {
  const details = entry.details ?? {}
  const parts = ['email', 'name', 'account', 'provider', 'sourceKind', 'direction', 'actionType', 'providerTypeId', 'timezone', 'currency']
    .filter(key => details[key] !== undefined && details[key] !== null).map(key => String(details[key]))
  if (details.status) parts.push(details.status === 'disabled' ? 'заблокирован' : 'активен')
  if (details.passwordReset) parts.push('пароль задан заново')
  return parts.join(' · ')
}

/** Consecutive identical events (same action, actor, workspace and details) collapse into one row: «Вход ×5». */
type Run = { first: AuditEntry; last: AuditEntry; count: number; summary: string }

function runs(entries: AuditEntry[]): Array<{ day: string; runs: Run[]; events: number }> {
  const days: Array<{ day: string; runs: Run[]; events: number }> = []
  for (const entry of entries) {
    const day = dayLabel(entry.at)
    if (days.at(-1)?.day !== day) days.push({ day, runs: [], events: 0 })
    const current = days.at(-1)!
    const text = summary(entry)
    const previous = current.runs.at(-1)
    current.events += 1
    if (previous && previous.first.action === entry.action && previous.first.actor_label === entry.actor_label
      && previous.first.tenant_id === entry.tenant_id && previous.summary === text) {
      previous.last = entry
      previous.count += 1
    } else current.runs.push({ first: entry, last: entry, count: 1, summary: text })
  }
  return days
}

const route = getRouteApi('/audit')

export function Audit() {
  const filter = route.useSearch({ select: search => search.type })
  const navigate = route.useNavigate()
  const type = FILTERS.find(option => option.id === filter)?.type
  const [state, setState] = useState<{ type?: string; entries: AuditEntry[]; next: number | null } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [moreError, setMoreError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const tenants = useResource(() => api.tenants(), [])
  const tenantName = new Map(tenants.data?.map(tenant => [tenant.id, tenant.name ?? 'Без названия']))

  useEffect(() => {
    let cancelled = false
    api.audit(undefined, type).then(
      page => { if (!cancelled) { setState({ type, ...page }); setError(null) } },
      failure => { if (!cancelled) setError(failure as Error) },
    )
    return () => { cancelled = true }
  }, [type, attempt])

  const current = state && state.type === type ? state : null
  const loadMore = async () => {
    if (!current?.next) return
    setBusy(true)
    setMoreError(null)
    try {
      const page = await api.audit(current.next, type)
      setState(previous => (previous && previous.type === type ? { type, entries: [...previous.entries, ...page.entries], next: page.next } : previous))
    } catch (failure) { setMoreError(failure as Error) } finally { setBusy(false) }
  }
  const choose = (id: AuditFilter | undefined) => {
    setMoreError(null)
    void navigate({ search: id ? { type: id } : {} })
  }
  const days = current ? runs(current.entries) : []

  return (
    <>
      <PageHeader eyebrow="Администрирование" icon={History} title="Журнал действий"
        subtitle="Кто, когда и что сделал в админке. Пароли и токены сюда не попадают." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <FilterSwitch value={filter} onChange={choose} />
        {current && current.entries.length > 0 && (
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {current.next ? 'Загружено' : 'Всего'} {numberFormat.format(current.entries.length)} {plural(current.entries.length, 'событие', 'события', 'событий')}
          </p>
        )}
      </div>
      {error && <ErrorNotice message={errorText(error)} onRetry={() => { setError(null); setAttempt(value => value + 1) }} />}
      {!current && !error && <AuditSkeleton />}
      {current && current.entries.length === 0 && (
        <Card data-tour="audit-empty">
          {filter
            ? <EmptyState title="Таких событий пока нет" action={<Button variant="outline" size="lg" onClick={() => choose(undefined)}>Показать все события</Button>}>
                Выберите другой тип или посмотрите весь журнал.
              </EmptyState>
            : <EmptyState title="Записей пока нет">
                Здесь появятся входы, изменения пользователей и ролей, подключения CRM и разметка данных.
              </EmptyState>}
        </Card>
      )}
      {days.length > 0 && (
        <div className="grid gap-6" data-tour="audit-list">
          {days.map(({ day, runs: list, events }) => (
            <section key={day} className="min-w-0">
              <h2 className="mb-2 flex items-baseline gap-2 text-[13px]">
                <span className="font-medium text-foreground">{day}</span>
                <span className="text-muted-foreground tabular-nums">{events} {plural(events, 'событие', 'события', 'событий')}</span>
              </h2>
              <Card className="gap-0 py-0">
                <motion.ol className="divide-y" variants={staggerList} initial="hidden" animate="show">
                  {list.map(run => <AuditRow key={run.first.id} run={run} workspace={run.first.tenant_id ? tenantName.get(run.first.tenant_id) : undefined} />)}
                </motion.ol>
              </Card>
            </section>
          ))}
          {moreError && <ErrorNotice message={errorText(moreError)} onRetry={() => void loadMore()} />}
          {current?.next && (
            <div className="flex justify-center">
              <Button variant="outline" size="lg" disabled={busy} onClick={() => void loadMore()}>
                {busy ? <><Loader2 className="animate-spin" />Загружаем…</> : 'Показать ещё'}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function AuditRow({ run, workspace }: { run: Run; workspace?: string }) {
  const { first, last, count } = run
  const danger = DANGER.has(first.action)
  // Entries are newest first: `first` is the latest event of the run, `last` the earliest.
  const time = count > 1 && timeFormat.format(last.at) !== timeFormat.format(first.at)
    ? `${timeFormat.format(last.at)}–${timeFormat.format(first.at)}` : timeFormat.format(first.at)
  const title = count > 1 ? `${fullFormat.format(last.at)} — ${fullFormat.format(first.at)}` : fullFormat.format(first.at)
  const meta = [run.summary, workspace].filter(Boolean).join(' · ')
  return (
    <motion.li variants={staggerItem}
      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 sm:px-5 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,14rem)_6.5rem] md:items-center md:gap-x-4">
      <span className={cn('mt-0.5 grid size-8 place-items-center rounded-lg md:mt-0 [&_svg]:size-4',
        danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
        <EventIcon action={first.action} />
      </span>
      <div className="min-w-0">
        <p className="flex min-w-0 items-baseline gap-2 text-[13.5px]">
          <span className={cn('truncate font-medium', danger && 'text-destructive')}>{ACTIONS[first.action] ?? first.action}</span>
          {count > 1 && <span className="flex-none text-xs text-muted-foreground tabular-nums">×{count}</span>}
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground" title={meta}>{meta}</p>}
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:hidden">
          <Avatar name={first.actor_label} small muted /><span className="truncate">{first.actor_label}</span>
        </p>
      </div>
      <span className="hidden min-w-0 items-center gap-2 text-[13px] md:flex" title={first.actor_label}>
        <Avatar name={first.actor_label} small muted /><span className="truncate">{first.actor_label}</span>
      </span>
      <time dateTime={new Date(first.at).toISOString()} title={title}
        className="pt-0.5 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums md:pt-0">{time}</time>
    </motion.li>
  )
}

/** «Все события | Входы | …» — a segmented switch from `sm`, a native select on phones. */
function FilterSwitch({ value, onChange }: { value: AuditFilter | undefined; onChange: (value: AuditFilter | undefined) => void }) {
  return (
    <>
      <label className="flex w-full items-center gap-2 sm:hidden">
        <ListFilter aria-hidden="true" className="size-4 flex-none text-muted-foreground" />
        <span className="sr-only">Тип событий</span>
        <div className="min-w-0 flex-1">
          <NativeSelect value={value ?? ''} onChange={event => onChange((event.target.value || undefined) as AuditFilter | undefined)}>
            {FILTERS.map(option => <option key={option.label} value={option.id ?? ''}>{option.label}</option>)}
          </NativeSelect>
        </div>
      </label>
      <div role="radiogroup" aria-label="Тип событий" className="hidden h-9 items-center gap-0.5 rounded-lg bg-muted p-0.5 sm:inline-flex">
        {FILTERS.map(option => (
          <button key={option.label} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)}
            className={cn('relative flex h-8 items-center rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              value === option.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {value === option.id && <motion.span layoutId="audit-filter" className="absolute inset-0 rounded-md bg-card shadow-card ring-1 ring-border"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** The log with placeholders: one day, rows with icon, two lines, actor and time. */
function AuditSkeleton() {
  return (
    <Busy>
      <SkeletonText className="mb-2 text-[13px]" width="9em" />
      <Card className="gap-0 py-0">
        <ol className="divide-y">
          {['40%', '55%', '35%', '62%', '45%', '50%'].map(width => (
            <li key={width} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 sm:px-5 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,14rem)_6.5rem] md:items-center md:gap-x-4">
              <SkeletonBlock className="mt-0.5 size-8 rounded-lg md:mt-0" />
              <div className="min-w-0">
                <SkeletonText className="text-[13.5px]" width={width} />
                <SkeletonText className="text-xs" width="30%" />
                <SkeletonText className="mt-1 text-xs md:hidden" width="45%" />
              </div>
              <span className="hidden items-center gap-2 md:flex"><SkeletonBlock className="size-5 rounded-md" /><SkeletonText className="flex-1 text-[13px]" width="70%" /></span>
              <SkeletonText className="pt-0.5 text-xs md:pt-0 [&>span]:ml-auto" width="2.8em" />
            </li>
          ))}
        </ol>
      </Card>
    </Busy>
  )
}
