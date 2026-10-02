import { useState, type FormEvent } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Coins, Database, Globe, MoreHorizontal, Pencil,
  Plug, Plus, Power, PowerOff, RefreshCw, Settings2,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useCan } from '@/lib/session'
import { api, type ConnectionSummary, type Provider, type Tenant } from '@/lib/api'
import { ConnectSheet } from '@/components/ConnectSheet'
import { AnimatedNumber } from '@/components/charts'
import { Avatar, EmptyState, ErrorNotice, Field, Metric, PageHeader, ProviderMark, StatusBadge, Steps, SyncBar } from '@/components/common'
import { Busy, SkeletonBlock, SkeletonText } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatAgo, formatDate, numberFormat, plural } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { navigate } from '@/lib/router'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const isLoading = (connection: ConnectionSummary) => connection.status === 'backfilling' || connection.status === 'connecting'
const needsAttention = (connection: ConnectionSummary) =>
  connection.status === 'degraded' || connection.status === 'reauthorization_required'

export function Workspace({ tenantId }: { tenantId: string }) {
  const detail = useResource(() => api.tenant(tenantId), [tenantId], data => data.connections.some(isLoading) ? 4000 : null)
  const [connect, setConnect] = useState<{ open: boolean; provider: Provider | null; key: number }>({ open: false, provider: null, key: 0 })
  const [renaming, setRenaming] = useState(false)
  const can = useCan()
  const manageConnections = can('connections.manage', tenantId)
  const manageWorkspace = can('workspaces.manage', tenantId)
  const openConnect = (provider: Provider | null = null) => setConnect(state => ({ open: true, provider, key: state.key + 1 }))
  const data = detail.data
  const connections = data?.connections ?? []

  if (detail.error) return <ErrorNotice message={errorText(detail.error)} onRetry={detail.reload} />
  if (!data) return <WorkspaceSkeleton />
  const name = data.tenant.name ?? 'Без названия'

  return (
    <>
      <PageHeader title={name} leading={<Avatar name={name} large />}
        crumbs={[{ label: 'Пространства', href: '#/' }, { label: name }]}
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 [&_svg]:size-3.5">
            <span className="flex items-center gap-1.5"><CalendarDays />Создано {formatDate(data.tenant.created_at)}</span>
            <span className="flex items-center gap-1.5"><Globe />{data.tenant.timezone?.replace(/_/g, ' ') ?? 'Часовой пояс не выбран'}</span>
            <span className="flex items-center gap-1.5"><Coins />{data.tenant.currency ?? 'Валюта не выбрана'}</span>
          </span>
        }
        actions={<>
          {can('analytics.view', tenantId) && (
            <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => navigate(`/tenants/${tenantId}/analytics`)}><BarChart3 />Аналитика</Button>
          )}
          {manageConnections && <Button size="lg" className="flex-1 sm:flex-none" onClick={() => openConnect()}><Plus />Подключить CRM</Button>}
          {manageWorkspace && <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label="Действия с пространством" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRenaming(true)}><Pencil />Переименовать</DropdownMenuItem>
              <DropdownMenuItem onClick={() => document.getElementById('workspace-settings')?.scrollIntoView({ behavior: 'smooth' })}>
                <Settings2 />Часовой пояс и валюта
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </>} />

      <Overview connections={connections} />

      <section className="mt-10" data-tour="workspace-connections">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Подключения</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {connections.length > 0 ? `${connections.length} ${plural(connections.length, 'аккаунт', 'аккаунта', 'аккаунтов')} CRM — откройте, чтобы увидеть загрузку и разметку данных.`
                : 'Аккаунты CRM этого клиента. Данные разных пространств не смешиваются.'}
            </p>
          </div>
        </div>
        {connections.length === 0 ? (manageConnections ? <FirstConnection onPick={openConnect} />
          : <Card><EmptyState title="CRM ещё не подключены">Подключить CRM может пользователь с правом «Управление подключениями».</EmptyState></Card>) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {connections.map(connection => <ConnectionCard key={connection.id} tenantId={tenantId} connection={connection} onChange={detail.reload}
              canManage={manageConnections} />)}
            {manageConnections && <button type="button" onClick={() => openConnect()}
              className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground">
              <Plus className="size-5" />Подключить ещё одну CRM
            </button>}
          </div>
        )}
      </section>

      {manageWorkspace && <WorkspaceSettings tenant={data.tenant} onSaved={detail.reload} />}

      <ConnectSheet key={connect.key} tenantId={tenantId} open={connect.open} initialProvider={connect.provider}
        onOpenChange={open => setConnect(state => ({ ...state, open }))} />
      <RenameWorkspace key={String(renaming)} tenantId={tenantId} current={data.tenant.name ?? ''} open={renaming}
        onOpenChange={setRenaming} onDone={() => { setRenaming(false); detail.reload() }} />
    </>
  )
}

function Overview({ connections }: { connections: ConnectionSummary[] }) {
  const lastSync = Math.max(0, ...connections.map(connection => connection.last_sync ?? 0))
  const live = connections.filter(c => c.status === 'live').length
  const loading = connections.filter(isLoading).length
  const attention = connections.filter(needsAttention).length
  const records = connections.reduce((sum, c) => sum + c.records, 0)
  const providers = [...new Set(connections.map(c => c.provider))]
  return (
    <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" variants={staggerList} initial="hidden" animate="show"
      data-tour="workspace-overview">
      <motion.div variants={staggerItem} className="grid">
        <Metric icon={Plug} label="Подключено CRM" value={<AnimatedNumber value={connections.length} />}
          meta={connections.length ? `${providers.length} ${plural(providers.length, 'система', 'системы', 'систем')} CRM` : 'Подключите первую CRM ниже'} />
      </motion.div>
      <motion.div variants={staggerItem} className="grid">
        <Metric icon={Activity} label="Работают" value={<AnimatedNumber value={live} />} tone={live > 0 && live === connections.length ? 'ok' : undefined}
          meta={connections.length ? (loading ? `${loading} ${plural(loading, 'загружается', 'загружаются', 'загружаются')}` : `из ${connections.length}`) : 'Нет подключений'}>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-success" initial={{ width: 0 }}
              animate={{ width: `${connections.length ? (live / connections.length) * 100 : 0}%` }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }} />
          </div>
        </Metric>
      </motion.div>
      <motion.div variants={staggerItem} className="grid">
        <Metric icon={AlertTriangle} label="Требуют внимания" value={<AnimatedNumber value={attention} />} tone={attention ? 'danger' : undefined}
          meta={attention ? 'Откройте и исправьте' : 'Ошибок нет'} />
      </motion.div>
      <motion.div variants={staggerItem} className="grid">
        <Metric icon={Database} label="Записей загружено" value={<AnimatedNumber value={records} />}
          meta={lastSync ? `Обновлено ${formatAgo(lastSync)}` : records ? 'Идёт первичная загрузка' : 'Загрузка ещё не начиналась'} />
      </motion.div>
    </motion.div>
  )
}

function ConnectionCard({ tenantId, connection, onChange, canManage }: {
  tenantId: string; connection: ConnectionSummary; onChange: () => void; canManage: boolean
}) {
  const toast = useToast()
  const href = `#/tenants/${tenantId}/connections/${connection.id}`
  const loading = isLoading(connection)
  const disconnected = connection.status === 'disconnected'
  const run = async (action: () => Promise<unknown>, done: string) => {
    try { await action(); toast.show(done); onChange() }
    catch (failure) { toast.show(errorText(failure), 'error') }
  }
  return (
    <Card className={cn('group relative gap-0 py-0 transition-[box-shadow,border-color] duration-200 hover:ring-foreground/15', disconnected && 'opacity-75')}>
      <a href={href} className="absolute inset-0 z-0 rounded-xl" aria-label={`Открыть ${connection.account}`} />
      <div className="flex items-start gap-3 px-5 pt-5">
        <ProviderMark provider={connection.provider} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{connection.account}</div>
          <div className="mt-1"><StatusBadge status={connection.status} /></div>
        </div>
        {canManage && <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="relative z-10 -mt-1 -mr-2" aria-label="Действия с подключением" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(href.slice(1))}><ArrowUpRight />Открыть</DropdownMenuItem>
            {!disconnected && (
              <DropdownMenuItem disabled={loading} onClick={() => run(() => api.resync(tenantId, connection.id), 'Полная синхронизация запущена')}>
                <RefreshCw />Полная синхронизация
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {disconnected
              ? <DropdownMenuItem onClick={() => run(() => api.resume(tenantId, connection.id), 'Подключение возобновлено')}><Power />Возобновить</DropdownMenuItem>
              : <DropdownMenuItem variant="destructive" onClick={() => run(() => api.disconnect(tenantId, connection.id), 'Подключение отключено, данные сохранены')}><PowerOff />Отключить</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      <div className="px-5 pt-4 pb-4">
        {loading && connection.kinds_total > 0 ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <SyncBar state="running" />
            <span className="tabular-nums">{connection.kinds_done} из {connection.kinds_total}</span>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-muted-foreground">Сделки</dt><dd className="text-[15px] font-semibold tabular-nums">{numberFormat.format(connection.commercial)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Действия</dt><dd className="text-[15px] font-semibold tabular-nums">{numberFormat.format(connection.work)}</dd></div>
          </dl>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between border-t px-5 py-2.5 text-xs text-muted-foreground">
        <span>{disconnected ? 'Синхронизация остановлена' : `Синхронизация ${formatAgo(connection.last_sync)}`}</span>
        {connection.events_mode === 'polling' && <span title="Тариф CRM не позволяет подписаться на события">сверка раз в час</span>}
      </div>
    </Card>
  )
}

const PROVIDER_STATE: Record<Provider['status'], string> = {
  available: 'Готово к подключению', not_configured: 'Нужны ключи приложения', planned: 'В разработке',
}

function FirstConnection({ onPick }: { onPick: (provider: Provider) => void }) {
  const providers = useResource(() => api.providers(), [])
  const ready = providers.data?.filter(provider => provider.status !== 'planned') ?? []
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="grid content-start gap-6 p-6 sm:p-8">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Подключите первую CRM</h3>
            <p className="mt-1.5 max-w-md text-[13.5px] text-muted-foreground">Три шага — и аналитика начнёт наполняться сама. Доступ только на чтение: в CRM ничего не меняется.</p>
          </div>
          <Steps items={[
            <><span className="font-medium">Выберите систему клиента</span><span className="block text-muted-foreground">Системы, готовые к подключению, — в списке рядом.</span></>,
            <><span className="font-medium">Войдите администратором CRM</span><span className="block text-muted-foreground">Через официальную авторизацию — пароль к нам не попадает.</span></>,
            <><span className="font-medium">Дождитесь первичной загрузки</span><span className="block text-muted-foreground">Сделки, звонки, встречи и задачи загрузятся и будут обновляться.</span></>,
          ]} />
        </div>
        <div className="grid content-start gap-3 border-t bg-muted/30 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="text-xs font-medium text-muted-foreground">Выберите систему</div>
          {!providers.data && (
            <Busy className="grid gap-2">
              {['40%', '50%', '35%'].map(width => (
                <div key={width} className="flex items-center gap-3.5 rounded-xl bg-card p-3 pr-4 shadow-card ring-1 ring-border">
                  <SkeletonBlock className="size-11 rounded-lg" />
                  <div className="min-w-0 flex-1"><SkeletonText className="text-[14px] font-medium" width={width} /><SkeletonText className="mt-0.5 text-xs" width="60%" /></div>
                  <SkeletonBlock className="size-4 rounded" />
                </div>
              ))}
            </Busy>
          )}
          <motion.div className="grid gap-2" variants={staggerList} initial="hidden" animate="show">
            {ready.map(provider => (
              <motion.button key={provider.id} type="button" onClick={() => onPick(provider)} variants={staggerItem}
                whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}
                className="group flex items-center gap-3.5 rounded-xl bg-card p-3 pr-4 text-left shadow-card ring-1 ring-border transition-shadow outline-none hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/60">
                <ProviderMark provider={provider.id} large />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{provider.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('size-1.5 rounded-full', provider.status === 'available' ? 'bg-success' : 'bg-warning')} />
                    {PROVIDER_STATE[provider.status]}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </motion.button>
            ))}
          </motion.div>
          <a href="#/integrations" className="mt-1 inline-flex items-center gap-1 justify-self-start text-[13px] font-medium">
            Все интеграции <ArrowRight className="size-3.5" />
          </a>
        </div>
      </div>
    </Card>
  )
}

const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'BYN', 'UZS', 'AMD', 'GEL', 'AED', 'CNY', 'TRY']
const PREFERRED_ZONES = ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Novosibirsk',
  'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Vladivostok', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Minsk', 'UTC']

function WorkspaceSettings({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [name, setName] = useState(tenant.name ?? '')
  const [timezone, setTimezone] = useState(tenant.timezone ?? '')
  const [currency, setCurrency] = useState(tenant.currency ?? '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const zones = [...new Set([...PREFERRED_ZONES, ...Intl.supportedValuesOf('timeZone')])]
  const changed = name.trim() !== (tenant.name ?? '') || timezone !== (tenant.timezone ?? '') || currency !== (tenant.currency ?? '')
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.updateTenant(tenant.id, { name: name.trim() || undefined, timezone: timezone || null, currency: currency || null })
      toast.show('Настройки пространства сохранены')
      onSaved()
    } catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  return (
    <section id="workspace-settings" data-tour="workspace-settings"
      className="mt-12 grid scroll-mt-6 gap-6 border-t pt-10 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold">Настройки пространства</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Используются в отчётах этого клиента. Ничего не конвертируется и не угадывается молча: без валюты суммы показываются как есть.
        </p>
      </div>
      <Card className="gap-0 py-0">
        <form onSubmit={save}>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <Field label="Название" htmlFor="ws-name" hint="Как пространство называется в списке и в отчётах.">
                <Input id="ws-name" maxLength={120} value={name} onChange={event => setName(event.target.value)} />
              </Field>
            </div>
            <Field label="Часовой пояс" htmlFor="tz" hint="Границы дней и недель в отчётах.">
              <NativeSelect id="tz" value={timezone} onChange={event => setTimezone(event.target.value)}>
                <option value="">Не выбран</option>
                {zones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Базовая валюта" htmlFor="currency" hint="Суммы в других валютах не конвертируются.">
              <NativeSelect id="currency" value={currency} onChange={event => setCurrency(event.target.value)}>
                <option value="">Не выбрана</option>
                {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3 rounded-b-xl border-t bg-muted/40 px-5 py-3 sm:px-6">
            <span className="mr-auto text-xs text-muted-foreground">{changed ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span>
            {changed && <Button variant="ghost" onClick={() => { setName(tenant.name ?? ''); setTimezone(tenant.timezone ?? ''); setCurrency(tenant.currency ?? '') }}>Отменить</Button>}
            <Button type="submit" disabled={!changed || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button>
          </div>
        </form>
      </Card>
    </section>
  )
}

function RenameWorkspace({ tenantId, current, open, onOpenChange, onDone }: {
  tenantId: string; current: string; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void
}) {
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.updateTenant(tenantId, { name })
      toast.show('Название сохранено')
      onDone()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader icon={Pencil}>
            <DialogTitle>Переименовать пространство</DialogTitle>
            <DialogDescription>Название видно только в этой админке, в CRM клиента ничего не меняется.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Название" htmlFor="rename" error={error}>
              <Input id="rename" required maxLength={120} autoFocus value={name} onChange={event => setName(event.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" size="lg" disabled={busy}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The workspace page with placeholders: header, the four metric tiles and two connection cards. */
function WorkspaceSkeleton() {
  const tiles = [{ icon: Plug, label: 'Подключено CRM' }, { icon: Activity, label: 'Работают', bar: true },
    { icon: AlertTriangle, label: 'Требуют внимания' }, { icon: Database, label: 'Записей загружено' }]
  return (
    <Busy>
      <PageHeader title={<SkeletonText className="text-[22px] leading-tight" width="10em" />} leading={<SkeletonBlock className="size-12 rounded-xl" />}
        crumbs={[{ label: 'Пространства', href: '#/' }, { label: '…' }]}
        meta={<><SkeletonText width="min(26em, 90%)" /><SkeletonText className="sm:hidden" width="55%" /><SkeletonText className="sm:hidden" width="45%" /></>}
        actions={<><SkeletonBlock className="h-9 flex-1 rounded-lg sm:w-28 sm:flex-none" /><SkeletonBlock className="h-9 flex-1 rounded-lg sm:w-40 sm:flex-none" /><SkeletonBlock className="size-9 rounded-lg" /></>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(tile => (
          <Metric key={tile.label} icon={tile.icon} label={tile.label} value={<SkeletonText className="leading-none" width="1.6ch" />}
            meta={<SkeletonText width="60%" />}>{tile.bar && <SkeletonBlock className="h-1.5 rounded-full" />}</Metric>
        ))}
      </div>
      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold">Подключения</h2>
          <SkeletonText className="mt-0.5 text-[13px]" width="min(30em, 90%)" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {['60%', '50%'].map(width => (
            <div key={width} className="flex flex-col rounded-xl bg-card shadow-card ring-1 ring-border">
              <div className="flex items-start gap-3 px-5 pt-5">
                <SkeletonBlock className="size-9 rounded-lg" />
                <div className="min-w-0 flex-1"><SkeletonText className="font-medium" width={width} /><SkeletonBlock className="mt-1 h-6 w-32" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 px-5 pt-4 pb-4">
                {[0, 1].map(index => <div key={index}><SkeletonText className="text-xs" width="50%" /><SkeletonText className="text-[15px] font-semibold" width="30%" /></div>)}
              </div>
              <div className="mt-auto border-t px-5 py-2.5 text-xs"><SkeletonText width="45%" /></div>
            </div>
          ))}
        </div>
      </section>
    </Busy>
  )
}
