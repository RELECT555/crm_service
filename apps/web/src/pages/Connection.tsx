import { useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { api, type ConnectionDetail } from '@/lib/api'
import { EmptyState, ErrorNotice, Field, LoadingRows, Notice, PageHeader, ProviderMark, Stat, StatusBadge, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ACTION_TYPES, actionLabel, formatAgo, formatDateTime, kindLabel, numberFormat, STATUS } from '@/lib/format'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const isSyncing = (data: ConnectionDetail) =>
  data.connection.status === 'backfilling' || !!data.sync.queue.queued || !!data.sync.queue.running

export function Connection({ tenantId, connectionId }: { tenantId: string; connectionId: string }) {
  const detail = useResource(() => api.connection(tenantId, connectionId), [tenantId, connectionId],
    data => isSyncing(data) ? 3000 : null)
  const tenant = useResource(() => api.tenant(tenantId), [tenantId])
  const [confirmResync, setConfirmResync] = useState(false)
  const toast = useToast()
  const data = detail.data

  const reauthorize = async () => {
    if (!data) return
    try {
      const { authorizeUrl } = await api.connect(tenantId, data.connection.provider, data.connection.account)
      window.location.assign(authorizeUrl)
    } catch (failure) { toast.show(errorText(failure), 'error') }
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Пространства', href: '#/' }, { label: tenant.data?.tenant.name ?? 'Пространство', href: `#/tenants/${tenantId}` },
          { label: data?.connection.account ?? '…' }]}
        title={data ? <span className="flex items-center gap-3"><ProviderMark provider={data.connection.provider} large /><span className="min-w-0 break-all">{data.connection.account}</span></span> : 'Подключение'}
        actions={data && <>
          <Button variant="outline" size="lg" onClick={reauthorize}><ExternalLink />Переавторизовать</Button>
          <Button variant="outline" size="lg" onClick={() => setConfirmResync(true)} disabled={isSyncing(data)}><RefreshCw />Полная синхронизация</Button>
        </>} />
      {detail.error && <ErrorNotice message={errorText(detail.error)} onRetry={detail.reload} />}
      {!data && !detail.error && <Card><LoadingRows rows={4} /></Card>}
      {data && (
        <div className="grid gap-5">
          <ConnectionNotice data={data} onReauthorize={reauthorize} />
          <Card className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
              <StatusBadge status={data.connection.status} />
              <span className="text-muted-foreground">{STATUS[data.connection.status]?.hint}</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y md:grid-cols-4 md:divide-y-0 [&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(3)]:border-l">
              <Stat label="Последняя полная синхронизация" value={formatAgo(data.connection.lastSync)} title={formatDateTime(data.connection.lastSync)} />
              <Stat label="Подписка на события" value={data.connection.eventsBound ? 'Активна' : 'Не настроена'} />
              <Stat label="ID аккаунта в CRM" value={data.connection.accountId} />
              <Stat label="Подключено" value={formatDateTime(data.connection.createdAt)} />
            </div>
          </Card>
          <SyncCoverage data={data} />
          <div className="grid gap-5 lg:grid-cols-2">
            <CommercialSources data={data} tenantId={tenantId} onChange={detail.reload} />
            <ActionTypes data={data} tenantId={tenantId} onChange={detail.reload} />
          </div>
        </div>
      )}
      <ResyncDialog tenantId={tenantId} connectionId={connectionId} open={confirmResync} onOpenChange={setConfirmResync}
        onDone={() => { setConfirmResync(false); detail.reload() }} />
    </>
  )
}

function ConnectionNotice({ data, onReauthorize }: { data: ConnectionDetail; onReauthorize: () => void }) {
  const { status, lastError } = data.connection
  if (status === 'reauthorization_required') {
    return (
      <Notice tone="danger" title="CRM отклонила доступ" action={<Button size="lg" onClick={onReauthorize}>Авторизоваться</Button>}>
        <p>Повторите авторизацию тем же аккаунтом — подключение восстановится без потери настроек.</p>
        {lastError && <p className="mt-1 font-mono text-xs text-muted-foreground">{lastError}</p>}
      </Notice>
    )
  }
  if (lastError) {
    return (
      <Notice tone={status === 'degraded' ? 'warn' : 'muted'} title="Последняя ошибка синхронизации">
        <p className="font-mono text-xs break-words">{lastError}</p>
      </Notice>
    )
  }
  return null
}

function SyncCoverage({ data }: { data: ConnectionDetail }) {
  const counts = new Map(data.sync.records.map(row => [row.kind, row.count]))
  const kinds = [...new Set([...data.sync.coverage.map(row => row.kind), ...data.sync.syncingKinds, ...counts.keys()])]
  const coverage = new Map(data.sync.coverage.map(row => [row.kind, row]))
  const totals = { commercial: 0, work: 0, context: 0 }
  for (const row of data.sync.records) totals[row.axis] += row.count
  const { queued = 0, running = 0, failed = 0 } = data.sync.queue

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">Синхронизация данных</CardTitle>
        <CardDescription>В очереди: {queued} · выполняется: {running}{failed ? ` · с ошибкой: ${failed}` : ''}</CardDescription>
        <CardAction className="flex flex-wrap gap-1.5">
          <ToneBadge tone="progress" dot={false}>Коммерческие: {numberFormat.format(totals.commercial)}</ToneBadge>
          <ToneBadge tone="ok" dot={false}>Работа: {numberFormat.format(totals.work)}</ToneBadge>
          <ToneBadge dot={false}>Справочные: {numberFormat.format(totals.context)}</ToneBadge>
        </CardAction>
      </CardHeader>
      {kinds.length === 0 ? (
        <EmptyState title="Загрузка ещё не началась">Задания поставлены в очередь — данные появятся в течение минуты.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Объект</TableHead><TableHead className="text-right">Записей</TableHead><TableHead className="w-[32%]">Состояние</TableHead><TableHead>Завершено</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {kinds.map(kind => {
              const checkpoint = coverage.get(kind)
              const syncing = data.sync.syncingKinds.includes(kind)
              const done = !!checkpoint?.completed_at && !syncing
              return (
                <TableRow key={kind}>
                  <TableCell className="font-medium">{kindLabel(kind)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numberFormat.format(counts.get(kind) ?? 0)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', done ? 'w-full bg-success' : syncing ? 'w-2/5 animate-pulse bg-primary' : 'w-0')} />
                      </div>
                      <span className="w-24 text-xs text-muted-foreground">{done ? 'Загружено' : syncing ? 'Загружается' : 'Ожидает'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(checkpoint?.completed_at)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

function MappingCard({ title, description, table, children }: { title: string; description: string; table?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {table && <div className="border-b">{table}</div>}
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  )
}

function CommercialSources({ data, tenantId, onChange }: { data: ConnectionDetail; tenantId: string; onChange: () => void }) {
  const [source, setSource] = useState<'deal' | 'smart'>('deal')
  const [smartId, setSmartId] = useState('')
  const [category, setCategory] = useState('')
  const [direction, setDirection] = useState<'sale' | 'purchase'>('purchase')
  const [amountField, setAmountField] = useState('opportunity')
  const [currencyField, setCurrencyField] = useState('currencyId')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const connectionId = data.connection.id

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.addCommercialSource(tenantId, connectionId, {
        entityTypeId: source === 'deal' ? 2 : Number(smartId), direction,
        ...(category.trim() ? { categoryId: Number(category) } : {}), amountField, currencyField,
      })
      toast.show('Маппинг сохранён, данные будут перечитаны')
      setCategory('')
      onChange()
    } catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  const remove = async (typeId: number, categoryId: string) => {
    try {
      await api.deleteCommercialSource(tenantId, connectionId, typeId, categoryId)
      toast.show('Маппинг удалён')
      onChange()
    } catch (failure) { toast.show(errorText(failure), 'error') }
  }

  return (
    <MappingCard title="Коммерческие процессы"
      description="Сделки по умолчанию считаются продажами. Закупки и смарт-процессы учитываются только после явной разметки."
      table={data.commercialSources.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Источник</TableHead><TableHead>Воронка</TableHead><TableHead>Тип</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.commercialSources.map(row => (
              <TableRow key={`${row.entity_type_id}-${row.category_id}`}>
                <TableCell>
                  <div className="font-medium">{row.entity_type_id === 2 ? 'Сделки' : `Смарт-процесс ${row.entity_type_id}`}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.amount_field} · {row.currency_field}</div>
                </TableCell>
                <TableCell>{row.category_id === '*' ? 'Все' : row.category_id}</TableCell>
                <TableCell><ToneBadge tone={row.direction === 'purchase' ? 'warn' : 'ok'} dot={false}>{row.direction === 'purchase' ? 'Закупка' : 'Продажа'}</ToneBadge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить маппинг" onClick={() => remove(row.entity_type_id, row.category_id)}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Источник" htmlFor="cs-source">
            <NativeSelect id="cs-source" value={source} onChange={event => {
              const next = event.target.value as 'deal' | 'smart'
              setSource(next)
              if (next === 'deal') { setAmountField('opportunity'); setCurrencyField('currencyId') }
            }}>
              <option value="deal">Сделки</option>
              <option value="smart">Смарт-процесс</option>
            </NativeSelect>
          </Field>
          {source === 'smart' && (
            <Field label="ID смарт-процесса" htmlFor="cs-smart">
              <Input id="cs-smart" required inputMode="numeric" pattern="\d+" placeholder="128" value={smartId} onChange={event => setSmartId(event.target.value)} />
            </Field>
          )}
          <Field label="ID воронки" htmlFor="cs-category">
            <Input id="cs-category" inputMode="numeric" pattern="\d*" placeholder="Все воронки" value={category} onChange={event => setCategory(event.target.value)} />
          </Field>
          <Field label="Поле суммы" htmlFor="cs-amount">
            <Input id="cs-amount" required className="font-mono" value={amountField} onChange={event => setAmountField(event.target.value)} />
          </Field>
          <Field label="Поле валюты" htmlFor="cs-currency">
            <Input id="cs-currency" required className="font-mono" value={currencyField} onChange={event => setCurrencyField(event.target.value)} />
          </Field>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Направление" className="inline-flex rounded-lg bg-muted p-0.5">
            {(['purchase', 'sale'] as const).map(value => (
              <button key={value} type="button" aria-pressed={direction === value} onClick={() => setDirection(value)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  direction === value && 'bg-card text-foreground shadow-sm')}>
                {value === 'purchase' ? 'Закупка' : 'Продажа'}
              </button>
            ))}
          </div>
          <Button type="submit" size="lg" disabled={busy}>Сохранить</Button>
        </div>
      </form>
    </MappingCard>
  )
}

function ActionTypes({ data, tenantId, onChange }: { data: ConnectionDetail; tenantId: string; onChange: () => void }) {
  const [providerTypeId, setProviderTypeId] = useState('')
  const [actionType, setActionType] = useState('visit')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const connectionId = data.connection.id

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.addActionType(tenantId, connectionId, providerTypeId.trim(), actionType)
      toast.show('Тип действия сопоставлен, дела будут перечитаны')
      setProviderTypeId('')
      onChange()
    } catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    try {
      await api.deleteActionType(tenantId, connectionId, id)
      toast.show('Сопоставление удалено')
      onChange()
    } catch (failure) { toast.show(errorText(failure), 'error') }
  }

  return (
    <MappingCard title="Типы действий менеджеров"
      description="Встречи, звонки, задачи и письма распознаются автоматически. Пользовательские типы дел (например, визиты) сопоставьте вручную."
      table={data.actionTypes.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Код типа в CRM</TableHead><TableHead>Считать как</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.actionTypes.map(row => (
              <TableRow key={row.provider_type_id}>
                <TableCell className="font-mono text-xs">{row.provider_type_id}</TableCell>
                <TableCell>{actionLabel(row.action_type)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить сопоставление" onClick={() => remove(row.provider_type_id)}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Код типа в CRM" htmlFor="at-code" hint="Например, PROVIDER_TYPE_ID дела в Bitrix24.">
            <Input id="at-code" required className="font-mono" pattern="[A-Za-z0-9_\-]{1,100}" placeholder="TRAVEL" value={providerTypeId} onChange={event => setProviderTypeId(event.target.value)} />
          </Field>
          <Field label="Считать как" htmlFor="at-type" hint="Тип в аналитике.">
            <NativeSelect id="at-type" value={actionType} onChange={event => setActionType(event.target.value)}>
              {ACTION_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div className="mt-1 flex justify-end"><Button type="submit" size="lg" disabled={busy}>Сопоставить</Button></div>
      </form>
    </MappingCard>
  )
}

function ResyncDialog({ tenantId, connectionId, open, onOpenChange, onDone }: {
  tenantId: string; connectionId: string; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = async () => {
    setBusy(true)
    try {
      await api.resync(tenantId, connectionId)
      toast.show('Полная синхронизация запущена')
      onDone()
    } catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Запустить полную синхронизацию?</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-muted-foreground">Все объекты будут перечитаны из CRM с начала, подписка на события будет проверена заново. Это расходует лимит запросов к API клиента; уже загруженные данные остаются доступны.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button size="lg" disabled={busy} onClick={run}>Запустить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
