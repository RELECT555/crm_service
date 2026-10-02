import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3, Check, ChevronsUpDown, Compass, History, KeyRound, LayoutGrid, Layers, LogOut, Menu, Monitor, Moon, PanelLeftClose,
  PanelLeftOpen, Plug, Plus, ShieldCheck, Sparkles, Sun, Users,
} from 'lucide-react'
import { Brand, BrandMark } from '@/components/Brand'
import { Avatar, Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuLinkItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { api, type TenantSummary } from '@/lib/api'
import { plural } from '@/lib/format'
import { useOnboarding } from '@/lib/onboarding'
import { navigate } from '@/lib/router'
import { useCan, useSession } from '@/lib/session'
import { LAST_TENANT_KEY, readStorage, writeStorage } from '@/lib/storage'
import { setTheme, type ThemePreference, useTheme } from '@/lib/theme'
import { errorText, useToast } from '@/lib/toast'
import { useMediaQuery } from '@/lib/use-media'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const COLLAPSE_KEY = 'crm-sidebar-collapsed'

/**
 * Responsive navigation (docs/ui-guidelines.md#layout):
 * phone (< md) — top bar + left sheet; tablet (md–lg) — 68px icon rail; desktop (≥ lg) — 256px, collapsible.
 */
export function Sidebar({ route }: { route: string[] }) {
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [userCollapsed, setUserCollapsed] = useState(() => readStorage(COLLAPSE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const collapsed = !desktop || userCollapsed
  const toggle = () => {
    writeStorage(COLLAPSE_KEY, userCollapsed ? '0' : '1')
    setUserCollapsed(!userCollapsed)
  }
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-sidebar/85 px-4 py-2.5 backdrop-blur-md md:hidden">
        <Brand />
        <button type="button" aria-label="Открыть меню" onClick={() => setMobileOpen(true)} data-tour="menu"
          className="grid size-9 place-items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent">
          <Menu className="size-5" />
        </button>
      </header>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-sidebar">
          <SheetTitle className="sr-only">Меню</SheetTitle>
          <SidebarContent route={route} collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <motion.aside initial={false} animate={{ width: collapsed ? 68 : 256 }} transition={{ type: 'spring', bounce: 0, visualDuration: 0.3 }}
        className="sticky top-0 hidden h-screen flex-none overflow-hidden border-r bg-sidebar md:block">
        <SidebarContent route={route} collapsed={collapsed} onToggle={desktop ? toggle : undefined} />
      </motion.aside>
    </>
  )
}

function SidebarContent({ route, collapsed, onToggle, onNavigate }: {
  route: string[]; collapsed: boolean; onToggle?: () => void; onNavigate?: () => void
}) {
  const can = useCan()
  const [section, routeTenant, sub] = route
  const tenants = useResource(() => api.tenants(), [])
  // Refresh in the background on navigation; the switcher keeps showing the last list meanwhile.
  const { reload } = tenants
  useEffect(() => { reload() }, [section, routeTenant, reload])
  useEffect(() => { if (section === 'tenants' && routeTenant) writeStorage(LAST_TENANT_KEY, routeTenant) }, [section, routeTenant])
  const currentId = section === 'tenants' ? routeTenant : readStorage(LAST_TENANT_KEY)
  // Someone with a single workspace never has to pick it first.
  const current = tenants.data?.find(tenant => tenant.id === currentId) ?? (tenants.data?.length === 1 ? tenants.data[0] : null)
  const admin = [
    can('users.manage') && { tour: 'nav-users', href: '#/users', icon: Users, label: 'Пользователи', active: section === 'users' },
    can('users.manage') && { tour: 'nav-roles', href: '#/roles', icon: ShieldCheck, label: 'Роли и права', active: section === 'roles' },
    can('audit.view') && { tour: 'nav-audit', href: '#/audit', icon: History, label: 'Журнал действий', active: section === 'audit' },
  ].filter(Boolean) as Array<{ tour: string; href: string; icon: typeof Users; label: string; active: boolean }>

  return (
    <div className="flex h-full w-full flex-col px-3 py-3.5">
      {/* Fixed left padding everywhere: icons keep their position while the width animates; only labels fade. */}
      <div className="mb-4 flex h-9 items-center overflow-hidden pl-2">
        <BrandMark />
        <Reveal show={!collapsed} className="ml-2.5 grid min-w-0 leading-none">
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">CRM Analytics</span>
          <span className="mt-1 truncate text-[11px] font-medium text-muted-foreground">Аналитика команды продаж</span>
        </Reveal>
      </div>

      <WorkspaceSwitcher tenants={tenants.data ?? []} current={current} collapsed={collapsed} onNavigate={onNavigate} />

      <nav aria-label="Разделы" className="mt-4 grid gap-0.5 overflow-y-auto">
        <Section label="Пространство" collapsed={collapsed} first />
        <NavItem tour="nav-overview" href={current ? `#/tenants/${current.id}` : '#/'} icon={LayoutGrid} label="Обзор" collapsed={collapsed} onNavigate={onNavigate}
          active={section === 'tenants' && !!routeTenant && sub !== 'analytics'} disabled={!current} />
        {(!current || can('analytics.view', current.id)) && (
          <NavItem tour="nav-analytics" href={current ? `#/tenants/${current.id}/analytics` : '#/'} icon={BarChart3} label="Аналитика" collapsed={collapsed}
            onNavigate={onNavigate} active={section === 'tenants' && sub === 'analytics'} disabled={!current} />
        )}
        {admin.length > 0 && <Section label="Администрирование" collapsed={collapsed} />}
        {admin.map(item => <NavItem key={item.href} {...item} collapsed={collapsed} onNavigate={onNavigate} />)}
        <Section label="Сервис" collapsed={collapsed} />
        <NavItem href="#/" icon={Layers} label="Все пространства" collapsed={collapsed} onNavigate={onNavigate} active={route.length === 0} />
        <NavItem tour="nav-integrations" href="#/integrations" icon={Plug} label="Интеграции" collapsed={collapsed} onNavigate={onNavigate} active={section === 'integrations'} />
      </nav>

      <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-1 pt-3">
        {onToggle && (
          <SidebarButton label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} collapsed={collapsed} onClick={onToggle}
            icon={collapsed ? PanelLeftOpen : PanelLeftClose} />
        )}
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  )
}

/** Group heading; on the rail it becomes a divider in the same spot, so nothing below jumps while the width animates. */
function Section({ label, collapsed, first }: { label: string; collapsed: boolean; first?: boolean }) {
  return (
    <div className={cn('relative flex h-6 items-end overflow-hidden px-2.5 pb-1', !first && 'mt-3')}>
      <Reveal show={!collapsed} className="text-[11px] font-medium whitespace-nowrap text-sidebar-muted">{label}</Reveal>
      {!first && (
        <motion.span aria-hidden="true" className="absolute inset-x-3 bottom-2.5 h-px bg-sidebar-border" initial={false}
          animate={{ opacity: collapsed ? 1 : 0 }} transition={{ duration: 0.2 }} />
      )}
    </div>
  )
}

function WorkspaceSwitcher({ tenants, current, collapsed, onNavigate }: {
  tenants: TenantSummary[]; current: TenantSummary | null; collapsed: boolean; onNavigate?: () => void
}) {
  const can = useCan()
  const name = current?.name ?? (current ? 'Без названия' : 'Выберите пространство')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="workspace-switcher"
        className="flex h-11 w-full items-center gap-2.5 overflow-hidden rounded-xl bg-card px-2 text-left shadow-card ring-1 ring-border transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted/60"
        title={collapsed ? name : undefined}>
        <Avatar name={current?.name ?? '?'} muted={!current} />
        <Reveal show={!collapsed} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {current ? `${current.connections} ${plural(current.connections, 'подключение', 'подключения', 'подключений')}` : `${tenants.length} доступно`}
              </span>
            </span>
            <ChevronsUpDown className="size-4 flex-none text-muted-foreground" />
        </Reveal>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side={collapsed ? 'right' : 'bottom'}>
        <DropdownMenuLabel>Пространства</DropdownMenuLabel>
        {tenants.length === 0 && <div className="px-2.5 py-2 text-[13px] text-muted-foreground">Нет доступных пространств</div>}
        {tenants.slice(0, 8).map(tenant => (
          <DropdownMenuLinkItem key={tenant.id} href={`#/tenants/${tenant.id}`} onClick={onNavigate}>
            <Avatar name={tenant.name ?? '?'} small />
            <span className="min-w-0 flex-1 truncate">{tenant.name ?? 'Без названия'}</span>
            {tenant.attention > 0 && <span className="size-1.5 rounded-full bg-destructive" title="Есть подключения, требующие внимания" />}
            {tenant.id === current?.id && <Check className="text-foreground!" />}
          </DropdownMenuLinkItem>
        ))}
        {tenants.length > 8 && <DropdownMenuLinkItem href="#/" onClick={onNavigate}><Layers />Все пространства ({tenants.length})</DropdownMenuLinkItem>}
        {can('workspaces.create') && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { navigate('/?new=1'); onNavigate?.() }}><Plus />Новое пространство</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Как в системе', icon: Monitor },
]

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { me, signOut } = useSession()
  const onboarding = useOnboarding()
  const { preference } = useTheme()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const name = me.user?.name ?? 'Сервисный ключ'
  const subtitle = me.user?.email ?? 'Полный доступ'
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-tour="user-menu"
          className="flex h-11 w-full items-center gap-2.5 overflow-hidden rounded-xl px-2 text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent"
          title={collapsed ? name : undefined}>
          <span className="grid size-7 flex-none place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
            {initials(name)}
          </span>
          <Reveal show={!collapsed} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
            </span>
            <ChevronsUpDown className="size-4 flex-none text-muted-foreground" />
          </Reveal>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={collapsed ? 'right' : 'top'} align={collapsed ? 'end' : 'start'} className="w-60">
          <DropdownMenuLabel>Тема</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={preference} onValueChange={value => setTheme(value as ThemePreference)}>
            {THEMES.map(theme => (
              <DropdownMenuRadioItem key={theme.value} value={theme.value} closeOnClick={false}><theme.icon />{theme.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onboarding.startTour}><Compass />Тур по разделам</DropdownMenuItem>
          <DropdownMenuItem onClick={onboarding.showWelcome}><Sparkles />Презентация</DropdownMenuItem>
          <DropdownMenuSeparator />
          {me.user && <DropdownMenuItem onClick={() => setPasswordOpen(true)}><KeyRound />Сменить пароль</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onClick={() => void signOut()}><LogOut />Выйти</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePassword key={String(passwordOpen)} open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  )
}

function ChangePassword({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.changePassword(current, next)
      toast.show('Пароль изменён. Другие сессии завершены.')
      onOpenChange(false)
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader icon={KeyRound}>
            <DialogTitle>Смена пароля</DialogTitle>
            <DialogDescription>Остальные ваши сессии завершатся, эта останется активной.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Текущий пароль" htmlFor="current-password">
              <Input id="current-password" type="password" autoComplete="current-password" required autoFocus value={current} onChange={e => setCurrent(e.target.value)} />
            </Field>
            <Field label="Новый пароль" htmlFor="new-password" hint="Не короче 10 символов." error={error}>
              <Input id="new-password" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={e => setNext(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" size="lg" disabled={busy}>Сменить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NavItem({ href, icon: Icon, label, active, collapsed, disabled, onNavigate, tour }: {
  href: string; icon: typeof Layers; label: string; active: boolean; collapsed: boolean; disabled?: boolean; onNavigate?: () => void
  /** `data-tour` anchor for the onboarding tour (lib/onboarding.ts). */
  tour?: string
}) {
  return (
    <a href={href} onClick={onNavigate} data-tour={tour} aria-current={active ? 'page' : undefined} aria-disabled={disabled || undefined}
      title={collapsed ? label : undefined}
      className={cn('relative flex h-8 items-center gap-2.5 overflow-hidden rounded-lg pr-2.5 pl-3.5 text-[13px] font-medium text-sidebar-foreground no-underline transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-foreground hover:no-underline',
        active && 'text-foreground',
        disabled && 'pointer-events-none opacity-40')}>
      {/* Shared layout highlight slides between items instead of blinking. */}
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-sidebar-accent"
        transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <Icon className={cn('relative size-4 flex-none', active ? 'text-foreground' : 'text-sidebar-muted')} />
      <Reveal show={!collapsed} className="relative truncate">{label}</Reveal>
    </a>
  )
}

function SidebarButton({ label, collapsed, onClick, icon: Icon }: { label: string; collapsed: boolean; onClick: () => void; icon: typeof Layers }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={collapsed ? label : undefined}
      className="flex h-8 items-center gap-2.5 overflow-hidden rounded-lg pr-2.5 pl-3.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-foreground">
      <Icon className="size-4 flex-none" /><Reveal show={!collapsed} className="whitespace-nowrap">{label}</Reveal>
    </button>
  )
}

/** Sidebar label that fades and slides in after the rail widens, and out at once when it narrows. */
function Reveal({ show, className, children }: { show: boolean; className?: string; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span className={className} initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.22, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}>
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?'
}
