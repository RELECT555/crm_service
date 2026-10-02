import { useState, type FormEvent } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { api, type Provider } from '@/lib/api'
import { ErrorNotice, Field } from '@/components/common'
import { ProviderDetails, ProviderSheetHeader } from '@/components/ProviderDetails'
import { ProviderGrid, ProviderGridSkeleton } from '@/components/ProviderGrid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

/** Two-step connect flow: pick a CRM, then enter the account and go to the provider's consent screen. */
export function ConnectSheet({ tenantId, open, onOpenChange, initialProvider = null }: {
  tenantId: string; open: boolean; onOpenChange: (open: boolean) => void; initialProvider?: Provider | null
}) {
  const providers = useResource(() => api.providers(), [])
  const [selected, setSelected] = useState<Provider | null>(initialProvider)
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
        {selected ? <ProviderSheetHeader provider={selected} subtitle={available ? 'Подключение аккаунта клиента' : undefined} /> : (
          <SheetHeader>
            <SheetTitle className="text-[17px] tracking-tight">Подключить CRM</SheetTitle>
            <SheetDescription>Выберите систему клиента. Доступ только на чтение.</SheetDescription>
          </SheetHeader>
        )}
        <SheetBody>
          {!selected && (
            <>
              {providers.error && <ErrorNotice message={errorText(providers.error)} onRetry={providers.reload} />}
              {!providers.data && !providers.error && <ProviderGridSkeleton count={4} />}
              {providers.data && <ProviderGrid providers={providers.data} onSelect={setSelected} />}
            </>
          )}
          {selected && (
            <div className="grid gap-6">
              {selected.status === 'not_configured' && <SetupNotice provider={selected} />}
              {selected.status === 'planned' && (
                <p className="text-[13px] text-muted-foreground">API изучено, коннектор ещё не реализован. Ниже — что понадобится для подключения.</p>
              )}
              {available && (
                <form id="connect-form" onSubmit={submit}>
                  <Field label={selected.accountLabel} htmlFor="account" error={error}
                    hint="Доступ только на чтение. Ключи CRM хранятся на сервере в зашифрованном виде.">
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
    <div className="rounded-xl bg-warning/8 px-4 py-3 text-[13px]">
      <p className="font-medium text-foreground">Добавьте ключи в <code className="font-mono text-xs">apps/api/.env</code> и перезапустите API</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{(provider.requiredEnv ?? []).join(' · ')}</p>
    </div>
  )
}
