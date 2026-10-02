import { useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import { ConnectDrawer } from '../components/ConnectDrawer.tsx'
import { Button, Card, EmptyState, ErrorAlert, Field, Modal, PageHeader, ProviderMark, Skeleton, StatusBadge } from '../components/ui.tsx'
import { formatAgo, formatDate, navigate, useResource } from '../lib.ts'
import { errorText, useToast } from '../toast.ts'

export function Workspace({ tenantId }: { tenantId: string }) {
  const detail = useResource(() => api.tenant(tenantId), [tenantId],
    data => data.connections.some(connection => connection.status === 'backfilling' || connection.status === 'connecting') ? 5000 : null)
  const [connecting, setConnecting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const name = detail.data?.tenant.name ?? (detail.data ? 'Без названия' : '…')

  return (
    <>
      <PageHeader crumbs={[{ label: 'Пространства', href: '#/' }, { label: name }]} title={name}
        subtitle="CRM-аккаунты клиента. Каждое подключение синхронизируется отдельно и только на чтение."
        actions={<>
          <Button icon="edit" onClick={() => setRenaming(true)} disabled={!detail.data}>Переименовать</Button>
          <Button variant="primary" icon="plus" onClick={() => setConnecting(true)}>Подключить CRM</Button>
        </>} />
      {detail.error && <ErrorAlert message={errorText(detail.error)} onRetry={detail.reload} />}
      <Card title="Подключения" flush>
        {!detail.data && !detail.error && <Skeleton />}
        {detail.data?.connections.length === 0 && (
          <EmptyState title="CRM ещё не подключена"
            action={<Button variant="primary" icon="plus" onClick={() => setConnecting(true)}>Подключить CRM</Button>}>
            Выберите систему клиента, авторизуйтесь в ней — загрузка данных начнётся автоматически.
          </EmptyState>
        )}
        {!!detail.data?.connections.length && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Аккаунт</th><th>Статус</th><th>Синхронизация</th><th>Подключено</th></tr></thead>
              <tbody>
                {detail.data.connections.map(connection => {
                  const open = () => navigate(`/tenants/${tenantId}/connections/${connection.id}`)
                  return (
                    <tr key={connection.id} className="row-link" tabIndex={0} onClick={open} onKeyDown={event => { if (event.key === 'Enter') open() }}>
                      <td>
                        <div className="row">
                          <ProviderMark provider={connection.provider} />
                          <div><div className="cell-main">{connection.account}</div><div className="cell-sub">ID аккаунта {connection.account_id}</div></div>
                        </div>
                      </td>
                      <td><StatusBadge status={connection.status} /></td>
                      <td className="subtle">{formatAgo(connection.last_sync)}</td>
                      <td className="subtle">{formatDate(connection.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {connecting && <ConnectDrawer tenantId={tenantId} onClose={() => setConnecting(false)} />}
      {renaming && detail.data && (
        <RenameWorkspace tenantId={tenantId} current={detail.data.tenant.name ?? ''}
          onClose={() => setRenaming(false)} onDone={() => { setRenaming(false); void detail.reload() }} />
      )}
    </>
  )
}

function RenameWorkspace({ tenantId, current, onClose, onDone }: { tenantId: string; current: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.renameTenant(tenantId, name)
      toast.show('Название сохранено')
      onDone()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Modal title="Переименовать пространство" onClose={onClose}
      footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" type="submit" form="rename-tenant" loading={busy}>Сохранить</Button></>}>
      <form id="rename-tenant" onSubmit={submit}>
        <Field label="Название" htmlFor="rename" error={error}>
          <input id="rename" className="input" required maxLength={120} autoFocus value={name} onChange={event => setName(event.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
