import { useState, type FormEvent } from 'react'
import { api, setAdminKey } from '@/lib/api'
import { Brand } from '@/components/Brand'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorText } from '@/lib/toast'

export function Login() {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.verifyKey(key.trim())
      setAdminKey(key.trim())
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  return (
    <main className="relative grid min-h-full place-items-center px-4 py-8">
      <div className="absolute top-4 right-4"><ThemeSwitch compact /></div>
      <div className="w-full max-w-sm animate-enter">
        <div className="mb-6"><Brand /></div>
        <Card>
          <CardContent>
            <form onSubmit={submit} className="grid gap-5 py-1">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Вход оператора</h1>
                <p className="mt-1 text-muted-foreground">Введите ADMIN_API_KEY сервера. Ключ вводится вручную и хранится только в этой вкладке браузера.</p>
              </div>
              <Field label="Ключ администратора" htmlFor="admin-key" error={error}>
                <Input id="admin-key" type="password" autoComplete="current-password" required autoFocus
                  value={key} onChange={event => setKey(event.target.value)} />
              </Field>
              <Button type="submit" size="lg" disabled={busy}>{busy ? 'Проверяем…' : 'Войти'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
