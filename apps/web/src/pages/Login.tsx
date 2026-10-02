import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Ellipsis, Eye, EyeOff, Pause, Play } from 'lucide-react'
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

const loginInputClass = 'h-11 bg-muted/40 text-base autofill:shadow-[inset_0_0_0_1000px_var(--muted)] autofill:[-webkit-text-fill-color:var(--foreground)] sm:text-sm'

/**
 * Sign-in, or — when the service has no users yet — creation of the first owner with the service key.
 * Built only from design tokens, so it follows the light/dark theme like the rest of the app.
 */
export function Login({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap'>('loading')
  // The backdrop always moves unless the user paused it here; the OS reduced-motion setting does not stop it.
  const [animated, setAnimated] = useState(() => {
    try { return localStorage.getItem('crm-login-motion') !== 'off' } catch { return true }
  })
  const toggleMotion = () => {
    setAnimated(!animated)
    try { localStorage.setItem('crm-login-motion', animated ? 'off' : 'on') } catch { /* choice lasts for this page */ }
  }
  useEffect(() => {
    api.authStatus().then(status => setMode(status.hasUsers ? 'login' : 'bootstrap')).catch(() => setMode('login'))
  }, [])
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-background">
      <LoginBackdrop animated={animated} />
      <header className="absolute top-0 right-0 z-10 px-4 py-4 sm:px-10 sm:py-6">
        <div role="group" aria-label="Оформление экрана" className="flex items-center gap-0.5 rounded-xl bg-card/80 p-1 shadow-card ring-1 ring-border backdrop-blur-sm">
          <Button variant="ghost" size="icon" onClick={toggleMotion} aria-pressed={animated}
            aria-label={animated ? 'Остановить анимацию фона' : 'Включить анимацию фона'}
            title={animated ? 'Остановить анимацию фона' : 'Включить анимацию фона'}
            className="size-10 text-muted-foreground">
            {animated ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          </Button>
          <ThemeSwitch compact className="size-10 text-muted-foreground" />
        </div>
      </header>
      <section aria-label="Авторизация" className="relative grid flex-1 grid-cols-1 place-items-center px-4 py-24">
        <motion.div className="w-full min-w-0 max-w-[420px]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: dialogSpring }}>
          <Card className="gap-0 py-0 shadow-pop">
            <CardContent className="p-6 sm:p-8">
              {mode === 'loading' ? (
                <div role="status" aria-label="Загружаем форму входа" className="grid gap-6">
                  <div className="flex justify-center"><Brand /></div>
                  <Skeleton className="mx-auto h-16 w-4/5" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-11" />
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
    <div className="text-center">
      <div className="mb-5 flex justify-center"><Brand /></div>
      <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]">
        {first}{accent && <><br /><span className="text-primary">{accent}</span></>}
      </h1>
      {children && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  )
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" disabled={busy} className="h-11 w-full gap-2">
      {children}{busy ? <Ellipsis aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
    </Button>
  )
}

function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, 'type' | 'className'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={`${loginInputClass} pr-12`} />
      <Button type="button" variant="ghost" size="icon" onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={visible} aria-controls={props.id}
        className="absolute top-0.5 right-0.5 size-10 text-muted-foreground">
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
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
    <form onSubmit={submit} aria-busy={busy} className="grid gap-6">
      <Heading first="С возвращением">Войдите в своё рабочее пространство.</Heading>
      <div className="grid gap-4">
        <Field label="Почта" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" placeholder="name@example.com" required autoFocus value={email} onChange={event => setEmail(event.target.value)} className={loginInputClass} />
        </Field>
        <Field label="Пароль" htmlFor="password" error={error}>
          <PasswordInput id="password" autoComplete="current-password" placeholder="Введите пароль" required value={password} onChange={event => setPassword(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-5">
        <SubmitButton busy={busy}>{busy ? 'Входим…' : 'Войти'}</SubmitButton>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">Для доступа обратитесь к администратору.</p>
      </div>
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
    <form onSubmit={submit} aria-busy={busy} className="grid gap-6">
      <Heading first="Первый запуск," accent="создайте владельца.">Остальных пользователей владелец добавит сам.</Heading>
      <div className="grid gap-4">
        <Field label="Сервисный ключ" htmlFor="admin-key" hint="ADMIN_API_KEY из apps/api/.env — нужен только сейчас.">
          <Input id="admin-key" type="password" autoComplete="off" required autoFocus value={form.adminKey} onChange={set('adminKey')} className={loginInputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя" htmlFor="owner-name">
            <Input id="owner-name" required maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} className={loginInputClass} />
          </Field>
          <Field label="Почта" htmlFor="owner-email">
            <Input id="owner-email" type="email" required autoComplete="username" value={form.email} onChange={set('email')} className={loginInputClass} />
          </Field>
        </div>
        <Field label="Пароль" htmlFor="owner-password" hint="Не короче 10 символов." error={error}>
          <PasswordInput id="owner-password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
      </div>
      <SubmitButton busy={busy}>{busy ? 'Создаём…' : 'Создать владельца и войти'}</SubmitButton>
    </form>
  )
}
