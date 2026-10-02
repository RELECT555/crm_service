import { useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import { Badge, Button, Card, EmptyState, ErrorAlert, Field, Modal, PageHeader, Skeleton } from '../components/ui.tsx'
import { formatDate, navigate, numberFormat, useResource } from '../lib.ts'
import { errorText, useToast } from '../toast.ts'

export function Workspaces() {
  const tenants = useResource(() => api.tenants(), [])
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader title="Пространства"
        subtitle="Пространство — это клиент сервиса. Внутри него подключаются CRM-аккаунты; данные разных пространств изолированы."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Новое пространство</Button>} />
      {tenants.error && <ErrorAlert message={errorText(tenants.error)} onRetry={tenants.reload} />}
      <Card flush>
        {!tenants.data && !tenants.error && <Skeleton />}
        {tenants.data?.length === 0 && (
          <EmptyState title="Пока нет ни одного пространства"
            action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Создать пространство</Button>}>
            Создайте пространство для клиента, затем подключите его CRM.
          </EmptyState>
        )}
        {!!tenants.data?.length && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Название</th><th className="num">Подключения</th><th>Состояние</th><th>Создано</th></tr></thead>
              <tbody>
                {tenants.data.map(tenant => (
                  <tr key={tenant.id} className="row-link" tabIndex={0} onClick={() => navigate(`/tenants/${tenant.id}`)}
                    onKeyDown={event => { if (event.key === 'Enter') navigate(`/tenants/${tenant.id}`) }}>
                    <td><div className="cell-main">{tenant.name ?? 'Без названия'}</div><div className="cell-sub mono">{tenant.id}</div></td>
                    <td className="num">{numberFormat.format(tenant.connections)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {tenant.connections === 0 && <Badge plain>Нет подключений</Badge>}
                        {tenant.live > 0 && <Badge tone="ok">Работают: {tenant.live}</Badge>}
                        {tenant.attention > 0 && <Badge tone="danger">Требуют внимания: {tenant.attention}</Badge>}
                        {tenant.connections - tenant.live - tenant.attention > 0 &&
                          <Badge tone="progress">Загружаются: {tenant.connections - tenant.live - tenant.attention}</Badge>}
                      </div>
                    </td>
                    <td className="subtle">{formatDate(tenant.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <CreateWorkspace onClose={() => setCreating(false)} />}
    </>
  )
}

function CreateWorkspace({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { tenantId } = await api.createTenant(name)
      toast.show('Пространство создано')
      navigate(`/tenants/${tenantId}`)
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Modal title="Новое пространство" onClose={onClose}
      footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" type="submit" form="create-tenant" loading={busy}>Создать</Button></>}>
      <form id="create-tenant" onSubmit={submit}>
        <Field label="Название клиента" htmlFor="tenant-name" error={error} hint="Например, юридическое название или бренд.">
          <input id="tenant-name" className="input" required maxLength={120} autoFocus value={name} onChange={event => setName(event.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
