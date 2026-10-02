import { useState, type FormEvent } from 'react'
import { api, type Provider } from '../api.ts'
import { useResource } from '../lib.ts'
import { errorText } from '../toast.ts'
import { ProviderDetails } from './ProviderDetails.tsx'
import { ProviderGrid } from './ProviderGrid.tsx'
import { Button, Drawer, ErrorAlert, Field, ProviderMark, Skeleton } from './ui.tsx'

/** Two-step connect flow: pick a CRM, then enter the account and go to the provider's consent screen. */
export function ConnectDrawer({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const providers = useResource(() => api.providers(), [])
  const [selected, setSelected] = useState<Provider | null>(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const { authorizeUrl } = await api.connect(tenantId, selected.id, account)
      window.location.assign(authorizeUrl)
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  if (selected) {
    const available = selected.status === 'available'
    return (
      <Drawer title={selected.name} subtitle={available ? 'Подключение аккаунта клиента' : 'Коннектор в разработке'} onClose={onClose}
        footer={<>
          <Button onClick={() => { setSelected(null); setError(null) }}>Назад</Button>
          {available && <Button variant="primary" type="submit" form="connect-form" loading={busy} icon="external">Авторизоваться</Button>}
        </>}>
        <div className="row" style={{ marginBottom: 20 }}>
          <ProviderMark provider={selected.id} large />
          <p className="muted">
            {available
              ? 'Сервис получит доступ только на чтение. Учётные данные CRM хранятся на сервере в зашифрованном виде и не попадают в браузер.'
              : 'Исследование API завершено, адаптер ещё не реализован. Ниже — что понадобится для подключения.'}
          </p>
        </div>
        {available && (
          <form id="connect-form" onSubmit={submit} style={{ marginBottom: 24 }}>
            <Field label={selected.accountLabel} htmlFor="account" error={error}
              hint={`Например: ${selected.accountHint}. После входа в CRM вы вернётесь на страницу подключения.`}>
              <input id="account" className="input" required autoFocus value={account} autoComplete="off" spellCheck={false}
                placeholder={selected.accountHint} onChange={event => setAccount(event.target.value)} />
            </Field>
          </form>
        )}
        <ProviderDetails provider={selected} />
      </Drawer>
    )
  }

  return (
    <Drawer title="Подключить CRM" subtitle="Выберите систему клиента" onClose={onClose}>
      {providers.error && <ErrorAlert message={errorText(providers.error)} onRetry={providers.reload} />}
      {!providers.data && !providers.error && <Skeleton rows={4} />}
      {providers.data && <ProviderGrid providers={providers.data} onSelect={setSelected} />}
    </Drawer>
  )
}
