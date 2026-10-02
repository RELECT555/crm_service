import { useState, type FormEvent } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { api, type Provider } from '@/lib/api'
import { ErrorNotice, Field, LoadingRows, Notice, ProviderMark } from '@/components/common'
import { ProviderDetails } from '@/components/ProviderDetails'
import { ProviderGrid } from '@/components/ProviderGrid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

/** Two-step connect flow: pick a CRM, then enter the account and go to the provider's consent screen. */
export function ConnectSheet({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const providers = useResource(() => api.providers(), [])
  const [selected, setSelected] = useState<Provider | null>(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const available = selected?.status === 'available'

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
  const back = () => { setSelected(null); setError(null) }

  return (
    <Sheet open={open} onOpenChange={next => { onOpenChange(next); if (!next) back() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{selected ? selected.name : 'Подключить CRM'}</SheetTitle>
          <SheetDescription>
            {!selected ? 'Выберите систему клиента' : available ? 'Подключение аккаунта клиента'
              : selected.status === 'not_configured' ? 'Коннектор готов, нужны ключи приложения' : 'Коннектор в разработке'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!selected && (
            <>
              {providers.error && <ErrorNotice message={errorText(providers.error)} onRetry={providers.reload} />}
              {!providers.data && !providers.error && <LoadingRows rows={4} />}
              {providers.data && <ProviderGrid providers={providers.data} onSelect={setSelected} />}
            </>
          )}
          {selected && (
            <div className="grid gap-6">
              <div className="flex items-start gap-3">
                <ProviderMark provider={selected.id} large />
                <p className="text-muted-foreground">
                  {available
                    ? 'Сервис получит доступ только на чтение. Учётные данные CRM хранятся на сервере в зашифрованном виде и не попадают в браузер.'
                    : selected.status === 'not_configured'
                      ? 'Коннектор реализован, но на сервере не заданы ключи OAuth-приложения. Как только они появятся, подключение станет доступно.'
                      : 'Исследование API завершено, адаптер ещё не реализован. Ниже — что понадобится для подключения.'}
                </p>
              </div>
              {selected.status === 'not_configured' && <SetupNotice provider={selected} />}
              {available && (
                <form id="connect-form" onSubmit={submit}>
                  <Field label={selected.accountLabel} htmlFor="account" error={error}
                    hint={`Например: ${selected.accountHint}. После входа в CRM вы вернётесь на страницу подключения.`}>
                    <Input id="account" required autoFocus value={account} autoComplete="off" spellCheck={false}
                      placeholder={selected.accountHint} onChange={event => setAccount(event.target.value)} />
                  </Field>
                </form>
              )}
              <ProviderDetails provider={selected} />
            </div>
          )}
        </SheetBody>
        {selected && (
          <SheetFooter>
            <Button variant="outline" size="lg" onClick={back}><ArrowLeft />Назад</Button>
            {available && <Button size="lg" type="submit" form="connect-form" disabled={busy}><ExternalLink />{busy ? 'Переход…' : 'Авторизоваться'}</Button>}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** What the server operator must add before this CRM can be connected. */
function SetupNotice({ provider }: { provider: Provider }) {
  return (
    <Notice tone="warn" title="Нужна настройка сервера">
      <p>Добавьте в <code className="font-mono text-xs">apps/api/.env</code> и перезапустите API:</p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-card px-3 py-2 font-mono text-xs text-foreground ring-1 ring-border">
        {(provider.requiredEnv ?? []).map(name => `${name}=…`).join('\n')}
      </pre>
    </Notice>
  )
}
