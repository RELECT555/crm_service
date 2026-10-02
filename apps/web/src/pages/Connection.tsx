import { useState, type FormEvent } from 'react'
import { api, type ConnectionDetail } from '../api.ts'
import { Badge, Button, Card, EmptyState, ErrorAlert, Field, Modal, PageHeader, ProviderMark, Skeleton, StatusBadge } from '../components/ui.tsx'
import { ACTION_TYPES, actionLabel, formatAgo, formatDateTime, kindLabel, numberFormat, STATUS, useResource } from '../lib.ts'
import { errorText, useToast } from '../toast.ts'

const isSyncing = (data: ConnectionDetail) =>
  data.connection.status === 'backfilling' || !!data.sync.queue.queued || !!data.sync.queue.running

export function Connection({ tenantId, connectionId }: { tenantId: string; connectionId: string }) {
  const detail = useResource(() => api.connection(tenantId, connectionId), [tenantId, connectionId],
    data => isSyncing(data) ? 3000 : null)
  const tenant = useResource(() => api.tenant(tenantId), [tenantId])
  const [confirmResync, setConfirmResync] = useState(false)
  const toast = useToast()
  const data = detail.data
  const tenantName = tenant.data?.tenant.name ?? 'Пространство'

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
        crumbs={[{ label: 'Пространства', href: '#/' }, { label: tenantName, href: `#/tenants/${tenantId}` }, { label: data?.connection.account ?? '…' }]}
        title={data ? <span className="row"><ProviderMark provider={data.connection.provider} large />{data.connection.account}</span> : 'Подключение'}
        actions={data && <>
          <Button icon="external" onClick={reauthorize}>Переавторизовать</Button>
          <Button icon="refresh" onClick={() => setConfirmResync(true)} disabled={isSyncing(data)}>Полная синхронизация</Button>
        </>} />
      {detail.error && <ErrorAlert message={errorText(detail.error)} onRetry={detail.reload} />}
      {!data && !detail.error && <Card><Skeleton rows={4} /></Card>}
      {data && (
        <div className="stack">
          <ConnectionAlert data={data} onReauthorize={reauthorize} />
          <Card flush>
            <div className="card-head">
              <div className="row"><StatusBadge status={data.connection.status} /><span className="muted">{STATUS[data.connection.status]?.hint}</span></div>
            </div>
            <div className="stats">
              <Stat label="Последняя полная синхронизация" value={formatAgo(data.connection.lastSync)} title={formatDateTime(data.connection.lastSync)} />
              <Stat label="Подписка на события" value={data.connection.eventsBound ? 'Активна' : 'Не настроена'} />
              <Stat label="ID аккаунта в CRM" value={data.connection.accountId} />
              <Stat label="Подключено" value={formatDateTime(data.connection.createdAt)} />
            </div>
          </Card>
          <SyncCoverage data={data} />
          <div className="grid-2">
            <CommercialSources data={data} tenantId={tenantId} onChange={detail.reload} />
            <ActionTypes data={data} tenantId={tenantId} onChange={detail.reload} />
          </div>
        </div>
      )}
      {confirmResync && data && (
        <ResyncModal tenantId={tenantId} connectionId={connectionId} onClose={() => setConfirmResync(false)}
          onDone={() => { setConfirmResync(false); void detail.reload() }} />
      )}
    </>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value" title={title}>{value}</div></div>
}

function ConnectionAlert({ data, onReauthorize }: { data: ConnectionDetail; onReauthorize: () => void }) {
  const { status, lastError } = data.connection
  if (status === 'reauthorization_required') {
    return (
      <div className="alert tone-danger" role="alert">
        <div style={{ flex: 1 }}>
          <p className="alert-title">CRM отклонила доступ</p>
          <p>Повторите авторизацию тем же аккаунтом — подключение восстановится без потери настроек.</p>
          {lastError && <p className="mono subtle">{lastError}</p>}
        </div>
        <Button variant="primary" size="sm" onClick={onReauthorize}>Авторизоваться</Button>
      </div>
    )
  }
  if (lastError) {
    return (
      <div className={`alert tone-${status === 'degraded' ? 'warn' : 'muted'}`} role="status">
        <div><p className="alert-title">Последняя ошибка синхронизации</p><p className="mono">{lastError}</p></div>
      </div>
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
    <Card title="Синхронизация данных"
      description={`В очереди: ${queued} · выполняется: ${running}${failed ? ` · с ошибкой: ${failed}` : ''}`}
      actions={<>
        <Badge tone="progress" plain>Коммерческие: {numberFormat.format(totals.commercial)}</Badge>
        <Badge tone="ok" plain>Работа: {numberFormat.format(totals.work)}</Badge>
        <Badge plain>Справочные: {numberFormat.format(totals.context)}</Badge>
      </>} flush>
      {kinds.length === 0 ? (
        <EmptyState title="Загрузка ещё не началась">Задания поставлены в очередь — данные появятся в течение минуты.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Объект</th><th className="num">Записей</th><th style={{ width: '30%' }}>Состояние</th><th>Завершено</th></tr></thead>
            <tbody>
              {kinds.map(kind => {
                const checkpoint = coverage.get(kind)
                const syncing = data.sync.syncingKinds.includes(kind)
                const done = !!checkpoint?.completed_at && !syncing
                return (
                  <tr key={kind}>
                    <td className="cell-main">{kindLabel(kind)}</td>
                    <td className="num">{numberFormat.format(counts.get(kind) ?? 0)}</td>
                    <td>
                      <div className="row">
                        <div className={`progress${done ? ' done' : syncing ? ' indeterminate' : ''}`} style={{ flex: 1 }}>
                          <span style={done ? { width: '100%' } : syncing ? undefined : { width: '0%' }} />
                        </div>
                        <span className="subtle" style={{ width: 110 }}>{done ? 'Загружено' : syncing ? 'Загружается' : 'Ожидает'}</span>
                      </div>
                    </td>
                    <td className="subtle">{formatDateTime(checkpoint?.completed_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
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
    <Card title="Коммерческие процессы"
      description="Сделки по умолчанию считаются продажами. Закупки и смарт-процессы учитываются только после явной разметки.">
      {data.commercialSources.length > 0 && (
        <div className="table-wrap" style={{ margin: '-8px -20px 16px' }}>
          <table>
            <thead><tr><th>Источник</th><th>Воронка</th><th>Тип</th><th /></tr></thead>
            <tbody>
              {data.commercialSources.map(row => (
                <tr key={`${row.entity_type_id}-${row.category_id}`}>
                  <td>
                    <div className="cell-main">{row.entity_type_id === 2 ? 'Сделки' : `Смарт-процесс ${row.entity_type_id}`}</div>
                    <div className="cell-sub mono">{row.amount_field} · {row.currency_field}</div>
                  </td>
                  <td>{row.category_id === '*' ? 'Все' : row.category_id}</td>
                  <td><Badge tone={row.direction === 'purchase' ? 'warn' : 'ok'} plain>{row.direction === 'purchase' ? 'Закупка' : 'Продажа'}</Badge></td>
                  <td className="num"><Button size="sm" variant="ghost" icon="trash" aria-label="Удалить маппинг" onClick={() => remove(row.entity_type_id, row.category_id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Источник" htmlFor="cs-source">
            <select id="cs-source" className="select" value={source} onChange={event => {
              const next = event.target.value as 'deal' | 'smart'
              setSource(next)
              if (next === 'deal') { setAmountField('opportunity'); setCurrencyField('currencyId') }
            }}>
              <option value="deal">Сделки</option>
              <option value="smart">Смарт-процесс</option>
            </select>
          </Field>
          {source === 'smart' && (
            <Field label="ID смарт-процесса" htmlFor="cs-smart">
              <input id="cs-smart" className="input" required inputMode="numeric" pattern="\d+" placeholder="128" value={smartId} onChange={event => setSmartId(event.target.value)} />
            </Field>
          )}
          <Field label="ID воронки" htmlFor="cs-category">
            <input id="cs-category" className="input" inputMode="numeric" pattern="\d*" placeholder="Все воронки" value={category} onChange={event => setCategory(event.target.value)} />
          </Field>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="Поле суммы" htmlFor="cs-amount">
            <input id="cs-amount" className="input mono" required value={amountField} onChange={event => setAmountField(event.target.value)} />
          </Field>
          <Field label="Поле валюты" htmlFor="cs-currency">
            <input id="cs-currency" className="input mono" required value={currencyField} onChange={event => setCurrencyField(event.target.value)} />
          </Field>
        </div>
        <div className="row-between" style={{ marginTop: 16 }}>
          <div className="segmented" role="group" aria-label="Направление">
            <button type="button" aria-pressed={direction === 'purchase'} onClick={() => setDirection('purchase')}>Закупка</button>
            <button type="button" aria-pressed={direction === 'sale'} onClick={() => setDirection('sale')}>Продажа</button>
          </div>
          <Button variant="primary" type="submit" loading={busy}>Сохранить</Button>
        </div>
      </form>
    </Card>
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
    <Card title="Типы действий менеджеров"
      description="Встречи, звонки, задачи и письма распознаются автоматически. Пользовательские типы дел (например, визиты) сопоставьте вручную.">
      {data.actionTypes.length > 0 && (
        <div className="table-wrap" style={{ margin: '-8px -20px 16px' }}>
          <table>
            <thead><tr><th>Код типа в CRM</th><th>Считать как</th><th /></tr></thead>
            <tbody>
              {data.actionTypes.map(row => (
                <tr key={row.provider_type_id}>
                  <td className="mono">{row.provider_type_id}</td>
                  <td>{actionLabel(row.action_type)}</td>
                  <td className="num"><Button size="sm" variant="ghost" icon="trash" aria-label="Удалить сопоставление" onClick={() => remove(row.provider_type_id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Код типа в CRM" htmlFor="at-code" hint="Например, PROVIDER_TYPE_ID дела в Bitrix24.">
            <input id="at-code" className="input mono" required pattern="[A-Za-z0-9_\-]{1,100}" placeholder="TRAVEL" value={providerTypeId} onChange={event => setProviderTypeId(event.target.value)} />
          </Field>
          <Field label="Считать как" htmlFor="at-type" hint="Тип в аналитике.">
            <select id="at-type" className="select" value={actionType} onChange={event => setActionType(event.target.value)}>
              {ACTION_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="row-between" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <Button variant="primary" type="submit" loading={busy}>Сопоставить</Button>
        </div>
      </form>
    </Card>
  )
}

function ResyncModal({ tenantId, connectionId, onClose, onDone }: { tenantId: string; connectionId: string; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = async () => {
    setBusy(true)
    try {
      await api.resync(tenantId, connectionId)
      toast.show('Полная синхронизация запущена')
      onDone()
    } catch (failure) {
      toast.show(errorText(failure), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title="Запустить полную синхронизацию?" onClose={onClose}
      footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" loading={busy} onClick={run}>Запустить</Button></>}>
      <p className="muted">Все объекты будут перечитаны из CRM с начала, подписка на события будет проверена заново. Это расходует лимит запросов к API клиента; уже загруженные данные остаются доступны.</p>
    </Modal>
  )
}
