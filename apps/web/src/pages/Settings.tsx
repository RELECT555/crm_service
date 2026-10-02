import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Check, Compass, KeyRound, Layers, Monitor, Moon, Palette, Settings2, ShieldCheck, Sparkles, Sun, UserRound } from 'lucide-react'
import { ChangePassword } from '@/components/ChangePassword'
import { Avatar, EmptyState, ErrorNotice, Field, PageHeader } from '@/components/common'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Busy, SkeletonText } from '@/components/skeletons'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { api, type Me, type TenantSummary, type UserPreferences } from '@/lib/api'
import { useOnboarding } from '@/lib/onboarding'
import { useCan, useSession } from '@/lib/session'
import { setTheme, useTheme, type ThemePreference } from '@/lib/theme'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

export function Settings() {
  const { me } = useSession()
  const tenants = useResource(() => api.tenants(), [me.user?.id])
  const onboarding = useOnboarding()
  const [passwordOpen, setPasswordOpen] = useState(false)
  return (
    <>
      <PageHeader eyebrow="Личный кабинет" icon={Settings2} title="Мои настройки"
        subtitle="Профиль, оформление и привычный порядок работы." />
      <div className="grid max-w-6xl grid-cols-1 gap-8 sm:gap-10">
        <SettingsSection icon={UserRound} title="Профиль" description="Как вы представлены коллегам и к каким пространствам у вас есть доступ.">
          {me.user ? <Profile key={me.user.id} user={me.user} tenants={tenants.data ?? []} /> : (
            <Card data-tour="settings-empty" className="py-0">
              <EmptyState title="Вы вошли с сервисным ключом">Войдите по почте и паролю, чтобы изменить профиль и сохранить личные настройки в аккаунте.</EmptyState>
            </Card>
          )}
        </SettingsSection>
        <SettingsSection icon={Palette} title="Интерфейс" description="Выберите комфортную тему. Системная подстроится под настройки устройства.">
          <Appearance />
        </SettingsSection>
        {me.preferences && <SettingsSection icon={Layers} title="Рабочее пространство" description="С чего начинать работу после входа. Прямые ссылки продолжат открывать нужный раздел.">
          {tenants.error ? <ErrorNotice message={errorText(tenants.error)} onRetry={tenants.reload} />
            : !tenants.data ? <Card><Busy className="grid gap-2 p-5"><SkeletonText width="90%" /><SkeletonText width="75%" /><SkeletonText width="60%" /></Busy></Card>
              : <StartPage key={`${me.preferences.defaultTenantId}:${me.preferences.landingPage}`} tenants={tenants.data} preferences={me.preferences} />}
        </SettingsSection>}
        {me.user && <SettingsSection icon={ShieldCheck} title="Безопасность" description="Управляйте паролем для входа в свой аккаунт.">
          <Card className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
              <span className="grid size-10 flex-none place-items-center rounded-lg bg-muted text-muted-foreground"><KeyRound className="size-4" /></span>
              <div className="min-w-0 flex-1 basis-40">
                <h3 className="text-sm font-medium">Пароль аккаунта</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">После смены пароля другие ваши сессии завершатся.</p>
              </div>
              <Button variant="outline" size="lg" onClick={() => setPasswordOpen(true)}>Сменить пароль</Button>
            </div>
          </Card>
        </SettingsSection>}
        <SettingsSection icon={Compass} title="Помощь" description="Освежите знакомство с сервисом или пройдите по доступным вам разделам.">
          <Card className="gap-0 divide-y py-0">
            <HelpAction icon={Sparkles} title="Презентация сервиса" description="Как связаны результаты команды и её работа." onClick={onboarding.showWelcome} />
            <HelpAction icon={Compass} title="Тур по разделам" description="Обзор возможностей прямо в интерфейсе." onClick={onboarding.startTour} />
          </Card>
        </SettingsSection>
      </div>
      {passwordOpen && <ChangePassword open onOpenChange={setPasswordOpen} />}
    </>
  )
}

function SettingsSection({ icon: Icon, title, description, children }: {
  icon: typeof UserRound; title: string; description: string; children: ReactNode
}) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Profile({ user, tenants }: { user: NonNullable<Me['user']>; tenants: TenantSummary[] }) {
  const { updateMe } = useSession()
  const [name, setName] = useState(user.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const changed = name.trim() !== user.name
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      updateMe(await api.updateMe({ name: name.trim() }))
      setName(name.trim())
      toast.show('Имя сохранено')
    } catch (failure) { setError(errorText(failure)) }
    finally { setBusy(false) }
  }
  return (
    <Card data-tour="settings-profile" className="gap-0 py-0">
      <form onSubmit={save} aria-busy={busy}>
        <div className="grid gap-5 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={user.name}>{user.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Личный аккаунт</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Имя" htmlFor="profile-name" error={error}>
              <Input id="profile-name" autoComplete="name" required maxLength={120} value={name} disabled={busy} aria-invalid={!!error}
                onChange={event => { setName(event.target.value); setError(null) }} />
            </Field>
            <Field label="Почта" htmlFor="profile-email" hint="Для изменения обратитесь к администратору.">
              <Input id="profile-email" type="email" autoComplete="email" value={user.email} readOnly className="bg-muted/40 text-muted-foreground" />
            </Field>
          </div>
        </div>
        <SaveFooter changed={changed} busy={busy} onCancel={() => { setName(user.name); setError(null) }} />
      </form>
      <div className="grid gap-3 border-t p-5 sm:p-6">
        <p className="text-xs font-medium text-muted-foreground">Роли и доступ</p>
        {user.assignments.length ? user.assignments.map(assignment => (
          <div key={`${assignment.roleId}:${assignment.tenantId}`} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
            <span className="flex min-w-0 items-center gap-2"><ShieldCheck className="size-3.5 flex-none text-muted-foreground" /><span className="break-words">{assignment.roleName ?? 'Роль'}</span></span>
            <span className="min-w-0 break-words text-muted-foreground">
              {assignment.tenantId ? tenants.find(tenant => tenant.id === assignment.tenantId)?.name ?? 'Отдельное пространство' : 'Все пространства'}
            </span>
          </div>
        )) : <p className="text-[13px] text-muted-foreground">Роли пока не назначены. Обратитесь к администратору за доступом к пространствам.</p>}
      </div>
    </Card>
  )
}

const THEMES: Array<{ value: ThemePreference; label: string; description: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Светлая', description: 'Светлый фон', icon: Sun },
  { value: 'dark', label: 'Тёмная', description: 'Тёмный фон', icon: Moon },
  { value: 'system', label: 'Системная', description: 'Как на устройстве', icon: Monitor },
]

function Appearance() {
  const { me, updateMe } = useSession()
  const { preference } = useTheme()
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const choose = async (theme: ThemePreference) => {
    const previous = preference
    setTheme(theme)
    if (!me.user) return
    setBusy(true)
    try {
      updateMe(await api.updateMe({ theme }))
      toast.show('Тема сохранена')
    } catch (failure) { setTheme(previous); toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  return (
    <Card className="gap-0 py-0" aria-busy={busy}>
      <div className="p-5 sm:p-6">
        <h3 className="text-sm font-medium">Тема оформления</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-label="Тема оформления">
          {THEMES.map(theme => {
            const selected = preference === theme.value
            return (
              <Button key={theme.value} variant="outline" disabled={busy} aria-pressed={selected} onClick={() => void choose(theme.value)}
                className={cn('relative h-auto min-w-0 items-start justify-start gap-3 rounded-xl p-4 whitespace-normal sm:flex-col sm:gap-4',
                  selected && 'border-primary bg-primary/5 ring-1 ring-primary')}>
                <theme.icon className="size-5! text-muted-foreground" strokeWidth={1.75} />
                <span className="grid gap-1 text-left">
                  <span className="text-[13px] font-medium">{theme.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{theme.description}</span>
                </span>
                {selected && <Check className="absolute top-4 right-4 size-3.5! text-primary" />}
              </Button>
            )
          })}
        </div>
      </div>
      <div className="rounded-b-xl border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground sm:px-6" role="status">
        {busy ? 'Сохраняем тему…' : me.user ? 'Применяется сразу и сохраняется в вашем аккаунте.' : 'Сохраняется на этом устройстве.'}
      </div>
    </Card>
  )
}

function StartPage({ tenants, preferences }: { tenants: TenantSummary[]; preferences: UserPreferences }) {
  const { updateMe } = useSession()
  const can = useCan()
  const toast = useToast()
  const [tenantId, setTenantId] = useState(preferences.defaultTenantId ?? '')
  const [landingPage, setLandingPage] = useState(preferences.landingPage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const analytics = !!tenantId && can('analytics.view', tenantId)
  const changed = tenantId !== (preferences.defaultTenantId ?? '') || landingPage !== preferences.landingPage
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      updateMe(await api.updateMe({ defaultTenantId: tenantId || null, landingPage }))
      toast.show('Стартовая страница сохранена')
    } catch (failure) { setError(errorText(failure)) }
    finally { setBusy(false) }
  }
  if (!tenants.length) return (
    <Card data-tour="settings-workspace-empty" className="py-0">
      <EmptyState title="Нет доступных пространств" action={can('workspaces.create')
        ? <Link to="/" search={{ new: true }} className={buttonVariants({ variant: 'outline' })}>Создать пространство</Link> : undefined}>
        {can('workspaces.create') ? 'Создайте пространство, затем выберите его стартовым.' : 'Попросите администратора дать доступ к пространству. После этого его можно будет выбрать стартовым.'}
      </EmptyState>
    </Card>
  )
  return (
    <Card className="gap-0 py-0" data-tour="settings-workspace">
      <form onSubmit={save} aria-busy={busy}>
        <div className="grid gap-5 p-5 sm:p-6">
          <Field label="Пространство по умолчанию" htmlFor="default-workspace" hint="Открывается при входе с главной страницы." error={error}>
            <NativeSelect id="default-workspace" disabled={busy} value={tenantId} onChange={event => {
              const next = event.target.value
              setTenantId(next)
              if (!next || !can('analytics.view', next)) setLandingPage('overview')
              setError(null)
            }}>
              <option value="">Все пространства</option>
              {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name ?? 'Без названия'}</option>)}
            </NativeSelect>
          </Field>
          {tenantId && <Field label="Стартовая страница" htmlFor="landing-page" hint={!analytics ? 'Для аналитики нужно право на её просмотр в этом пространстве.' : undefined}>
            <NativeSelect id="landing-page" disabled={busy} value={landingPage} onChange={event => setLandingPage(event.target.value as UserPreferences['landingPage'])}>
              <option value="overview">Обзор пространства</option>
              {analytics && <option value="analytics">Аналитика команды</option>}
            </NativeSelect>
          </Field>}
        </div>
        <SaveFooter changed={changed} busy={busy} onCancel={() => {
          setTenantId(preferences.defaultTenantId ?? ''); setLandingPage(preferences.landingPage); setError(null)
        }} />
      </form>
    </Card>
  )
}

function SaveFooter({ changed, busy, onCancel }: { changed: boolean; busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-muted/30 px-5 py-3 sm:px-6">
      <span className="mr-auto text-xs text-muted-foreground" role="status">{busy ? 'Сохраняем…' : changed ? 'Есть изменения' : 'Все изменения сохранены'}</span>
      {changed && <Button variant="ghost" disabled={busy} onClick={onCancel}>Отменить</Button>}
      <Button type="submit" disabled={!changed || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button>
    </div>
  )
}

function HelpAction({ icon: Icon, title, description, onClick }: {
  icon: typeof Compass; title: string; description: string; onClick: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const open = async () => {
    setBusy(true)
    try { await onClick() }
    catch (failure) { toast.show(errorText(failure), 'error') }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
      <Icon className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 basis-40">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" size="lg" disabled={busy} onClick={() => void open()} aria-label={`Открыть: ${title}`}>
        {busy ? 'Открываем…' : 'Открыть'}<ArrowUpRight />
      </Button>
    </div>
  )
}
