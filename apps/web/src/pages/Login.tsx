import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { api } from '@/lib/api'
import { Brand } from '@/components/Brand'
import { LoginBackdrop } from '@/components/LoginBackdrop'
import { Field } from '@/components/common'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { dialogSpring } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { useMediaQuery } from '@/lib/use-media'

/**
 * Sign-in, or — when the service has no users yet — creation of the first owner with the service key.
 * Built only from design tokens, so it follows the light/dark theme like the rest of the app.
 */
export function Login({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap'>('loading')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [motionPreference, setMotionPreference] = useState<boolean | null>(() => {
    try {
      const value = localStorage.getItem('crm-login-motion')
      return value === 'on' ? true : value === 'off' ? false : null
    } catch { return null } // Blocked storage: follow the system preference.
  })
  const animated = motionPreference ?? !reducedMotion
  const toggleMotion = () => {
    setMotionPreference(!animated)
    try { localStorage.setItem('crm-login-motion', animated ? 'off' : 'on') } catch { /* choice lasts for this page */ }
  }
  useEffect(() => {
    api.authStatus().then(status => setMode(status.hasUsers ? 'login' : 'bootstrap')).catch(() => setMode('login'))
  }, [])
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-background">
      <LoginBackdrop animated={animated} />
      <header className="relative flex items-center justify-between px-5 py-5 sm:px-10 sm:py-7">
        <Brand />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleMotion} aria-pressed={animated}
            aria-label={animated ? 'Остановить анимацию фона' : 'Включить анимацию фона'}
            title={animated ? 'Остановить анимацию фона' : 'Включить анимацию фона'}
            className="size-9 bg-background/70 text-sidebar-muted backdrop-blur-sm">
            {animated ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          </Button>
          <ThemeSwitch compact className="bg-background/70 backdrop-blur-sm" />
        </div>
      </header>
      <section aria-label="Авторизация" className="relative grid flex-1 grid-cols-1 place-items-center px-4 py-8 sm:py-12">
        <motion.div className="w-full min-w-0 max-w-[460px]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: dialogSpring }}>
          <Card className="rounded-2xl bg-card/95 py-8 shadow-pop backdrop-blur-xl sm:py-10">
            <CardContent className="px-6 sm:px-10">
              {mode === 'loading' ? (
                <div role="status" aria-label="Загружаем форму входа" className="grid gap-5">
                  <Skeleton className="h-16 w-3/4" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-10" />
                  <span className="sr-only">Загружаем форму входа…</span>
                </div>
              ) : (
                mode === 'login' ? <LoginForm onSignedIn={onSignedIn} /> : <BootstrapForm onSignedIn={onSignedIn} />
              )}
            </CardContent>
          </Card>
        </motion.div>
      </section>
    </main>
  )
}

function Heading({ first, accent, children }: { first: string; accent?: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] leading-[1.2] font-semibold tracking-tight">
        {first}{accent && <><br /><span className="text-primary">{accent}</span></>}
      </h1>
      {children && <p className="mt-2 text-muted-foreground">{children}</p>}
    </div>
  )
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" disabled={busy} className="group mt-2 w-full">
      {children}<ArrowRight aria-hidden="true" className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5" />
    </Button>
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
    <form onSubmit={submit} className="grid gap-4">
      <Heading first="С возвращением" />
      <Field label="Почта" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={event => setEmail(event.target.value)} />
      </Field>
      <Field label="Пароль" htmlFor="password" error={error}>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      </Field>
      <SubmitButton busy={busy}>{busy ? 'Входим…' : 'Войти'}</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">Нет доступа? Попросите администратора создать вам пользователя.</p>
    </form>
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
    <form onSubmit={submit} className="grid gap-4">
      <Heading first="Первый запуск," accent="создайте владельца.">Остальных пользователей владелец добавит сам.</Heading>
      <Field label="Сервисный ключ" htmlFor="admin-key" hint="ADMIN_API_KEY из apps/api/.env — нужен только сейчас.">
        <Input id="admin-key" type="password" autoComplete="off" required autoFocus value={form.adminKey} onChange={set('adminKey')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" htmlFor="owner-name">
          <Input id="owner-name" required maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Почта" htmlFor="owner-email">
          <Input id="owner-email" type="email" required autoComplete="username" value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <Field label="Пароль" htmlFor="owner-password" hint="Не короче 10 символов." error={error}>
        <Input id="owner-password" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
      </Field>
      <SubmitButton busy={busy}>{busy ? 'Создаём…' : 'Создать владельца и войти'}</SubmitButton>
    </form>
  )
}
