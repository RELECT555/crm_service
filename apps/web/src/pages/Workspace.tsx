import { useState, type FormEvent } from 'react'
import { ArrowUpRight, BarChart3, MoreHorizontal, Pencil, Plus, RefreshCw, Settings2, Power, PowerOff } from 'lucide-react'
import { useCan } from '@/lib/session'
import { api, type ConnectionSummary, type Provider, type Tenant } from '@/lib/api'
import { ConnectSheet } from '@/components/ConnectSheet'
import { Avatar, EmptyState, ErrorNotice, Field, LoadingRows, ProviderMark, StatusBadge, SyncBar } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatAgo, formatDate, numberFormat, plural } from '@/lib/format'
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
  if (!data) return <Card><LoadingRows rows={5} /></Card>
  const name = data.tenant.name ?? 'Без названия'

  return (
    <>
      <nav aria-label="Навигация" className="mb-5 flex items-center gap-2 text-[13px] text-muted-foreground">
        <a href="#/" className="text-muted-foreground hover:text-foreground">Пространства</a><span aria-hidden="true">/</span>
        <span className="truncate text-foreground">{name}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={name} large />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words sm:truncate">{name}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {[`Создано ${formatDate(data.tenant.created_at)}`, data.tenant.timezone, data.tenant.currency && `валюта ${data.tenant.currency}`]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex basis-full flex-wrap gap-2 sm:basis-auto">
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
        </div>
      </header>

      <Overview connections={connections} />

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Подключения</h2>
          {connections.length > 0 && <span className="text-[13px] text-muted-foreground">{connections.length} {plural(connections.length, 'аккаунт', 'аккаунта', 'аккаунтов')} CRM</span>}
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
  const tiles = [
    { label: 'Подключено CRM', value: numberFormat.format(connections.length) },
    { label: 'Работают', value: numberFormat.format(connections.filter(c => c.status === 'live').length),
      hint: connections.some(isLoading) ? `${connections.filter(isLoading).length} загружается` : undefined },
    { label: 'Требуют внимания', value: numberFormat.format(connections.filter(needsAttention).length),
      tone: connections.some(needsAttention) ? 'text-destructive' : undefined },
    { label: 'Записей загружено', value: numberFormat.format(connections.reduce((sum, c) => sum + c.records, 0)),
      hint: lastSync ? `обновлено ${formatAgo(lastSync)}` : undefined },
  ]
  return (
    <Card className="grid grid-cols-2 gap-0 py-0 md:grid-cols-4">
      {tiles.map((tile, index) => (
        // Dividers: 2x2 grid on phones, one row from md; explicit per tile to avoid divide-* edge cases.
        <div key={tile.label} className={cn('px-5 py-4', index % 2 === 1 && 'border-l', index >= 2 && 'border-t md:border-t-0',
          index === 2 && 'md:border-l')}>
          <div className="text-xs text-muted-foreground">{tile.label}</div>
          <div className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', tile.tone)}>{tile.value}</div>
          <div className="mt-0.5 h-4 text-xs text-muted-foreground">{tile.hint}</div>
        </div>
      ))}
    </Card>
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

function FirstConnection({ onPick }: { onPick: (provider: Provider) => void }) {
  const providers = useResource(() => api.providers(), [])
  const ready = providers.data?.filter(provider => provider.status !== 'planned') ?? []
  return (
    <Card className="items-center px-6 py-10 text-center">
      <p className="text-[15px] font-semibold">Подключите первую CRM</p>
      <p className="max-w-md text-muted-foreground">Выберите систему клиента и войдите в неё — загрузка данных начнётся автоматически. Доступ только на чтение.</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {ready.map(provider => (
          <button key={provider.id} type="button" onClick={() => onPick(provider)}
            className="flex items-center gap-2.5 rounded-xl bg-card py-2 pr-4 pl-2 text-[13px] font-medium shadow-card ring-1 ring-border transition-colors hover:bg-muted/50">
            <ProviderMark provider={provider.id} />{provider.name}
          </button>
        ))}
      </div>
    </Card>
  )
}

const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'BYN', 'UZS', 'AMD', 'GEL', 'AED', 'CNY', 'TRY']
const PREFERRED_ZONES = ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Novosibirsk',
  'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Vladivostok', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Minsk', 'UTC']

function WorkspaceSettings({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [timezone, setTimezone] = useState(tenant.timezone ?? '')
  const [currency, setCurrency] = useState(tenant.currency ?? '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const zones = [...new Set([...PREFERRED_ZONES, ...Intl.supportedValuesOf('timeZone')])]
  const changed = timezone !== (tenant.timezone ?? '') || currency !== (tenant.currency ?? '')
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.updateTenant(tenant.id, { timezone: timezone || null, currency: currency || null })
      toast.show('Настройки пространства сохранены')
      onSaved()
    } catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  return (
    <section id="workspace-settings" className="mt-10 scroll-mt-6">
      <h2 className="mb-3 text-[15px] font-semibold">Настройки пространства</h2>
      <Card>
        <form onSubmit={save} className="grid gap-4 px-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Часовой пояс" htmlFor="tz" hint="Границы дней и недель в будущих отчётах.">
            <NativeSelect id="tz" value={timezone} onChange={event => setTimezone(event.target.value)}>
              <option value="">Не выбран</option>
              {zones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Базовая валюта" htmlFor="currency" hint="Суммы в других валютах не конвертируются молча.">
            <NativeSelect id="currency" value={currency} onChange={event => setCurrency(event.target.value)}>
              <option value="">Не выбрана</option>
              {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
            </NativeSelect>
          </Field>
          <Button type="submit" size="lg" disabled={!changed || busy} className="sm:mb-[22px]">Сохранить</Button>
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
          <DialogHeader><DialogTitle>Переименовать пространство</DialogTitle></DialogHeader>
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
