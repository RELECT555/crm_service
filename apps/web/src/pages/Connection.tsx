import { useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink, MoreHorizontal, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react'
import { api, type ConnectionDetail, type JobSummary } from '@/lib/api'
import { EmptyState, ErrorNotice, Field, LoadingRows, Notice, PageHeader, ProviderMark, Stat, StatusBadge, SyncBar, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ACTION_TYPES, actionLabel, formatAgo, formatDateTime, kindLabel, numberFormat, STATUS } from '@/lib/format'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const eventsLabel = (data: ConnectionDetail) =>
  data.connection.eventsMode === 'webhook' ? 'По событиям' : data.connection.eventsMode === 'polling' ? 'Сверка раз в час' : 'Настраивается'

const isSyncing = (data: ConnectionDetail) =>
  data.connection.status === 'backfilling' || !!data.sync.queue.queued || !!data.sync.queue.running

export function Connection({ tenantId, connectionId }: { tenantId: string; connectionId: string }) {
  const detail = useResource(() => api.connection(tenantId, connectionId), [tenantId, connectionId],
    data => isSyncing(data) ? 3000 : null)
  const tenant = useResource(() => api.tenant(tenantId), [tenantId])
  const [confirmResync, setConfirmResync] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const toast = useToast()
  const data = detail.data
  const run = async (action: () => Promise<unknown>, done: string) => {
    try { await action(); toast.show(done); detail.reload() }
    catch (failure) { toast.show(errorText(failure), 'error') }
  }

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
          {data.connection.status === 'disconnected'
            ? <Button size="lg" onClick={() => run(() => api.resume(tenantId, connectionId), 'Подключение возобновлено')}><Power />Возобновить</Button>
            : <Button variant="outline" size="lg" onClick={() => setConfirmResync(true)} disabled={isSyncing(data)}><RefreshCw />Полная синхронизация</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label="Действия с подключением" />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={reauthorize}><ExternalLink />Переавторизовать в CRM</DropdownMenuItem>
              {data.connection.status !== 'disconnected' && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDisconnect(true)}><PowerOff />Отключить</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </>} />
      {detail.error && <ErrorNotice message={errorText(detail.error)} onRetry={detail.reload} />}
      {!data && !detail.error && <Card><LoadingRows rows={4} /></Card>}
      {data && (
        <div className="stagger grid gap-5">
          <ConnectionNotice data={data} onReauthorize={reauthorize} />
          <Card className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
              <StatusBadge status={data.connection.status} />
              <span className="text-muted-foreground">{STATUS[data.connection.status]?.hint}</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y md:grid-cols-4 md:divide-y-0 [&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(3)]:border-l">
              <Stat label="Последняя полная синхронизация" value={formatAgo(data.connection.lastSync)} title={formatDateTime(data.connection.lastSync)} />
              <Stat label="Изменения из CRM" value={eventsLabel(data)} title={data.connection.eventsMode === 'polling'
                ? 'Тариф CRM не позволяет подписаться на события; данные перечитываются каждый час.' : undefined} />
              <Stat label="ID аккаунта в CRM" value={data.connection.accountId} />
              <Stat label="Подключено" value={formatDateTime(data.connection.createdAt)} />
            </div>
          </Card>
          <SyncCoverage data={data} />
          <div className="grid gap-5 lg:grid-cols-2">
            <CommercialSources data={data} tenantId={tenantId} onChange={detail.reload} />
            <ActionTypes data={data} tenantId={tenantId} onChange={detail.reload} />
          </div>
          <ActivityLog tenantId={tenantId} connectionId={connectionId} live={isSyncing(data)} />
        </div>
      )}
      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader><DialogTitle>Отключить подключение?</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-muted-foreground">Синхронизация остановится, события из CRM будут игнорироваться. Загруженные данные и разметка
              сохранятся — подключение можно возобновить в любой момент. В самой CRM ничего не меняется.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setConfirmDisconnect(false)}>Отмена</Button>
            <Button variant="destructive" size="lg" onClick={() => { setConfirmDisconnect(false); void run(() => api.disconnect(tenantId, connectionId), 'Подключение отключено, данные сохранены') }}>Отключить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ResyncDialog tenantId={tenantId} connectionId={connectionId} open={confirmResync} onOpenChange={setConfirmResync}
        onDone={() => { setConfirmResync(false); detail.reload() }} />
    </>
  )
}

function ConnectionNotice({ data, onReauthorize }: { data: ConnectionDetail; onReauthorize: () => void }) {
  const { status, lastError } = data.connection
  if (status === 'disconnected') {
    return (
      <Notice tone="muted" title="Подключение отключено">
        <p>Синхронизация остановлена, события из CRM игнорируются. Данные и разметка сохранены — нажмите «Возобновить», чтобы перечитать всё заново.</p>
      </Notice>
    )
  }
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
        <CardAction className="hidden gap-5 text-right sm:flex">
          <Total label="коммерческих" value={totals.commercial} />
          <Total label="действий" value={totals.work} />
          <Total label="справочных" value={totals.context} />
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
                  <TableCell className="font-medium">{kindLabel(kind, data.mappingOptions?.customSource)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numberFormat.format(counts.get(kind) ?? 0)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <SyncBar state={done ? 'done' : syncing ? 'running' : 'waiting'} />
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

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[15px] font-semibold tabular-nums">{numberFormat.format(value)}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
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
  const options = data.mappingOptions
  const pipelineNames = new Map(data.pipelines.map(pipeline => [pipeline.id, pipeline.label]))
  const [source, setSource] = useState(options?.sources[0]?.kind ?? '')
  const [customId, setCustomId] = useState('')
  const [category, setCategory] = useState('')
  const [direction, setDirection] = useState<'sale' | 'purchase'>('purchase')
  const [amountField, setAmountField] = useState(options?.fieldMapping?.amountDefault ?? '')
  const [currencyField, setCurrencyField] = useState(options?.fieldMapping?.currencyDefault ?? '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  if (!options) {
    return <MappingCard title="Коммерческие процессы" description="Коннектор этой CRM сейчас не настроен на сервере — разметка недоступна.">{null}</MappingCard>
  }
  const custom = options.customSource
  const isCustom = source === '__custom'
  // Pipelines apply to fixed kinds (e.g. deals); custom processes have their own categories, entered by ID.
  const pickPipeline = !isCustom && data.pipelines.length > 0
  const sourceLabel = (kind: string) =>
    options.sources.find(item => item.kind === kind)?.label ?? kindLabel(kind, custom)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.addCommercialSource(tenantId, data.connection.id, {
        sourceKind: isCustom && custom ? `${custom.prefix}${customId}` : source, direction,
        ...(category ? { categoryId: category } : {}),
        ...(options.fieldMapping ? { amountField, currencyField } : {}),
      })
      toast.show('Разметка сохранена, данные будут перечитаны')
      setCategory('')
      onChange()
    } catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  const remove = async (kind: string, categoryId: string) => {
    try {
      await api.deleteCommercialSource(tenantId, data.connection.id, kind, categoryId)
      toast.show('Разметка удалена')
      onChange()
    } catch (failure) { toast.show(errorText(failure), 'error') }
  }

  return (
    <MappingCard title="Коммерческие процессы"
      description="Сделки по умолчанию считаются продажами. Закупки — только по явной разметке воронки или процесса."
      table={data.commercialSources.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Источник</TableHead><TableHead>Воронка</TableHead><TableHead>Тип</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.commercialSources.map(row => (
              <TableRow key={`${row.source_kind}-${row.category_id}`}>
                <TableCell>
                  <div className="font-medium">{sourceLabel(row.source_kind)}</div>
                  {row.amount_field && <div className="font-mono text-xs text-muted-foreground">{row.amount_field} · {row.currency_field}</div>}
                </TableCell>
                <TableCell>{row.category_id === '*' ? 'Все' : pipelineNames.get(row.category_id) ?? row.category_id}</TableCell>
                <TableCell><ToneBadge tone={row.direction === 'purchase' ? 'warn' : 'ok'}>{row.direction === 'purchase' ? 'Закупка' : 'Продажа'}</ToneBadge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить разметку" onClick={() => remove(row.source_kind, row.category_id)}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Источник" htmlFor="cs-source">
            <NativeSelect id="cs-source" value={source} onChange={event => { setSource(event.target.value); setCategory('') }}>
              {options.sources.map(item => <option key={item.kind} value={item.kind}>{item.label}</option>)}
              {custom && <option value="__custom">{custom.label}</option>}
            </NativeSelect>
          </Field>
          {isCustom && custom && (
            <Field label={custom.idLabel} htmlFor="cs-custom" hint={`Число от ${custom.minId}.`}>
              <Input id="cs-custom" required inputMode="numeric" pattern="\d+" placeholder={String(custom.minId)} value={customId} onChange={event => setCustomId(event.target.value)} />
            </Field>
          )}
          <Field label="Воронка" htmlFor="cs-category" hint={pickPipeline ? undefined : 'ID воронки; пусто — все воронки.'}>
            {pickPipeline ? (
              <NativeSelect id="cs-category" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="">Все воронки</option>
                {data.pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.label}</option>)}
              </NativeSelect>
            ) : (
              <Input id="cs-category" inputMode="numeric" pattern="\d*" placeholder="Все воронки" value={category} onChange={event => setCategory(event.target.value)} />
            )}
          </Field>
          {options.fieldMapping && (
            <>
              <Field label="Поле суммы" htmlFor="cs-amount">
                <Input id="cs-amount" required className="font-mono" value={amountField} onChange={event => setAmountField(event.target.value)} />
              </Field>
              <Field label="Поле валюты" htmlFor="cs-currency">
                <Input id="cs-currency" required className="font-mono" value={currencyField} onChange={event => setCurrencyField(event.target.value)} />
              </Field>
            </>
          )}
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
  const options = data.mappingOptions

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.addActionType(tenantId, connectionId, providerTypeId.trim(), actionType)
      toast.show('Тип действия сопоставлен, данные будут перечитаны')
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
      description="Встречи, звонки и задачи распознаются автоматически. Пользовательские типы (например, визиты) сопоставьте вручную."
      table={data.actionTypes.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Код в CRM</TableHead><TableHead>Считать как</TableHead><TableHead /></TableRow></TableHeader>
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
          <Field label={options?.activityCodeLabel ?? 'Код типа в CRM'} htmlFor="at-code" hint={options?.activityCodeHint}>
            <Input id="at-code" required className="font-mono" pattern="[A-Za-z0-9_\-]{1,100}" value={providerTypeId} onChange={event => setProviderTypeId(event.target.value)} />
          </Field>
          <Field label="Считать как" htmlFor="at-type" hint="Тип в аналитике.">
            <NativeSelect id="at-type" value={actionType} onChange={event => setActionType(event.target.value)}>
              {ACTION_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div className="mt-1 flex justify-end"><Button type="submit" size="lg" disabled={busy || !options}>Сопоставить</Button></div>
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

const JOB_LABELS: Record<JobSummary['type'], string> = { sync: 'Загрузка', fetch: 'Изменение из CRM', bind: 'Подписка на события' }
const JOB_STATUS: Record<JobSummary['status'], { label: string; dot: string }> = {
  queued: { label: 'В очереди', dot: 'bg-muted-foreground/40' },
  running: { label: 'Выполняется', dot: 'bg-info' },
  done: { label: 'Готово', dot: 'bg-success' },
  failed: { label: 'Ошибка', dot: 'bg-destructive' },
  cancelled: { label: 'Отменено', dot: 'bg-muted-foreground/40' },
}

/** Recent jobs with their last error: the first place to look when a connection misbehaves. */
function ActivityLog({ tenantId, connectionId, live }: { tenantId: string; connectionId: string; live: boolean }) {
  const jobs = useResource(() => api.activity(tenantId, connectionId), [tenantId, connectionId], () => live ? 4000 : null)
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">Журнал синхронизации</CardTitle>
        <CardDescription>Последние 30 заданий. Ошибки повторяются автоматически, после пяти неудач подключение помечается как сбойное.</CardDescription>
      </CardHeader>
      {jobs.error && <div className="p-5"><ErrorNotice message={errorText(jobs.error)} onRetry={jobs.reload} /></div>}
      {!jobs.data && !jobs.error && <LoadingRows />}
      {jobs.data?.length === 0 && <EmptyState title="Заданий пока не было" />}
      {!!jobs.data?.length && (
        <Table>
          <TableHeader><TableRow><TableHead>Время</TableHead><TableHead>Задание</TableHead><TableHead>Статус</TableHead><TableHead>Подробности</TableHead></TableRow></TableHeader>
          <TableBody>
            {jobs.data.map(job => {
              const status = JOB_STATUS[job.status]
              return (
                <TableRow key={job.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(job.finished_at ?? job.created_at)}</TableCell>
                  <TableCell>{JOB_LABELS[job.type]}{job.type !== 'bind' && <span className="text-muted-foreground"> · {kindLabel(job.kind)}</span>}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={cn('size-1.5 rounded-full', status.dot)} />{status.label}</span>
                  </TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">
                    {job.error ? <span className="font-mono break-words text-destructive/90">{job.error}</span>
                      : job.attempts > 1 ? `с ${job.attempts}-й попытки` : ''}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
