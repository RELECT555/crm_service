import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { Brand } from '@/components/Brand'
import { Field } from '@/components/common'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { dialogSpring } from '@/lib/motion'
import { errorText } from '@/lib/toast'

/** Sign-in, or — when the service has no users yet — creation of the first owner with the service key. */
export function Login({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap'>('loading')
  useEffect(() => {
    api.authStatus().then(status => setMode(status.hasUsers ? 'login' : 'bootstrap')).catch(() => setMode('login'))
  }, [])
  return (
    <main className="relative grid min-h-full place-items-center px-4 py-10">
      <div className="absolute top-4 right-4"><ThemeSwitch compact /></div>
      {mode !== 'loading' && (
        <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: dialogSpring }}>
          <div className="mb-6 flex justify-center"><Brand /></div>
          {mode === 'login' ? <LoginForm onSignedIn={onSignedIn} /> : <BootstrapForm onSignedIn={onSignedIn} />}
        </motion.div>
      )}
    </main>
  )
}

function LoginForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(email, password)
      await onSignedIn()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 py-1">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Вход</h1>
            <p className="mt-1 text-muted-foreground">Админка аналитики CRM.</p>
          </div>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={event => setEmail(event.target.value)} />
          </Field>
          <Field label="Пароль" htmlFor="password" error={error}>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</Button>
          <p className="text-center text-xs text-muted-foreground">Нет доступа? Попросите администратора создать вам пользователя.</p>
        </form>
      </CardContent>
    </Card>
  )
}

function BootstrapForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [form, setForm] = useState({ adminKey: '', name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(state => ({ ...state, [key]: event.target.value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.bootstrap(form.adminKey.trim(), { name: form.name, email: form.email, password: form.password })
      await onSignedIn()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 py-1">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Первый запуск</h1>
            <p className="mt-1 text-muted-foreground">Создайте владельца. Остальных пользователей он добавит сам.</p>
          </div>
          <Field label="Сервисный ключ" htmlFor="admin-key" hint="ADMIN_API_KEY из apps/api/.env — нужен только сейчас.">
            <Input id="admin-key" type="password" autoComplete="off" required autoFocus value={form.adminKey} onChange={set('adminKey')} />
          </Field>
          <Field label="Имя" htmlFor="owner-name">
            <Input id="owner-name" required maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Email" htmlFor="owner-email">
            <Input id="owner-email" type="email" required autoComplete="username" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Пароль" htmlFor="owner-password" hint="Не короче 10 символов." error={error}>
            <Input id="owner-password" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Создаём…' : 'Создать владельца и войти'}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
