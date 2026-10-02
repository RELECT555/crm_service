import { useEffect, useState, type AnchorHTMLAttributes, type ComponentProps, type ReactNode, type Ref } from 'react'
import { createLink, useMatches, useNavigate, useParams } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3, Check, ChevronsUpDown, History, LayoutGrid, Layers, LogOut, Menu, PanelLeftClose,
  PanelLeftOpen, Plug, Plus, Settings2, ShieldCheck, Users,
} from 'lucide-react'
import { Brand, BrandMark } from '@/components/Brand'
import { Avatar } from '@/components/common'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuLinkItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { api, type TenantSummary } from '@/lib/api'
import { plural } from '@/lib/format'
import { useCan, useSession } from '@/lib/session'
import { LAST_TENANT_KEY, readStorage, writeStorage } from '@/lib/storage'
import { useMediaQuery } from '@/lib/use-media'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const COLLAPSE_KEY = 'crm-sidebar-collapsed'

/**
 * Responsive navigation (docs/ui-guidelines.md#layout):
 * phone (< md) — top bar + left sheet; tablet (md–lg) — 68px icon rail; desktop (≥ lg) — 256px, collapsible.
 */
export function Sidebar() {
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
          <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <motion.aside initial={false} animate={{ width: collapsed ? 68 : 256 }} transition={{ type: 'spring', bounce: 0, visualDuration: 0.3 }}
        className="sticky top-0 hidden h-screen flex-none overflow-hidden border-r bg-sidebar md:block">
        <SidebarContent collapsed={collapsed} onToggle={desktop ? toggle : undefined} />
      </motion.aside>
    </>
  )
}

function SidebarContent({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const can = useCan()
  const { me } = useSession()
  // The deepest matched route (the root itself on «Страница не найдена»); its id says which item is active.
  const routeId = useMatches({ select: matches => matches[matches.length - 1]?.routeId })
  const { tenantId: routeTenant } = useParams({ strict: false })
  const tenants = useResource(() => api.tenants(), [])
  // Refresh in the background on navigation; the switcher keeps showing the last list meanwhile.
  const { reload } = tenants
  useEffect(() => { reload() }, [routeId, routeTenant, reload])
  useEffect(() => { if (routeTenant) writeStorage(LAST_TENANT_KEY, routeTenant) }, [routeTenant])
  const currentId = routeTenant ?? readStorage(LAST_TENANT_KEY)
  // Someone with a single workspace never has to pick it first.
  const current = tenants.data?.find(tenant => tenant.id === currentId)
    ?? tenants.data?.find(tenant => tenant.id === me.preferences?.defaultTenantId)
    ?? (tenants.data?.length === 1 ? tenants.data[0] : null)
  const workspace = { tenantId: current?.id ?? '' }
  const admin = [
    can('users.manage') && { tour: 'nav-users', to: '/users', icon: Users, label: 'Пользователи' } as const,
    can('users.manage') && { tour: 'nav-roles', to: '/roles', icon: ShieldCheck, label: 'Роли и права' } as const,
    can('audit.view') && { tour: 'nav-audit', to: '/audit', icon: History, label: 'Журнал действий' } as const,
  ].filter(item => item !== false)

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
        <NavItem tour="nav-overview" to="/tenants/$tenantId" params={workspace} disabled={!current} icon={LayoutGrid} label="Обзор" collapsed={collapsed}
          onClick={onNavigate} active={routeId === '/tenants/$tenantId' || routeId === '/tenants/$tenantId/connections/$connectionId'} />
        {(!current || can('analytics.view', current.id)) && (
          <NavItem tour="nav-analytics" to="/tenants/$tenantId/analytics" params={workspace} disabled={!current} icon={BarChart3} label="Аналитика"
            collapsed={collapsed} onClick={onNavigate} active={routeId === '/tenants/$tenantId/analytics'} />
        )}
        {admin.length > 0 && <Section label="Администрирование" collapsed={collapsed} />}
        {admin.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onNavigate} active={routeId === item.to} />)}
        <Section label="Сервис" collapsed={collapsed} />
        <NavItem to="/" icon={Layers} label="Все пространства" collapsed={collapsed} onClick={onNavigate} active={routeId === '/'} />
        <NavItem tour="nav-integrations" to="/integrations" icon={Plug} label="Интеграции" collapsed={collapsed} onClick={onNavigate} active={routeId === '/integrations'} />
      </nav>

      <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-1 pt-3">
        {onToggle && (
          <SidebarButton label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} collapsed={collapsed} onClick={onToggle}
            icon={collapsed ? PanelLeftOpen : PanelLeftClose} />
        )}
        <UserMenu collapsed={collapsed} onNavigate={onNavigate} />
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
  const navigate = useNavigate()
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
          <MenuLink key={tenant.id} to="/tenants/$tenantId" params={{ tenantId: tenant.id }} activeOptions={{ exact: true }} onClick={onNavigate}>
            <Avatar name={tenant.name ?? '?'} small />
            <span className="min-w-0 flex-1 truncate">{tenant.name ?? 'Без названия'}</span>
            {tenant.attention > 0 && <span className="size-1.5 rounded-full bg-destructive" title="Есть подключения, требующие внимания" />}
            {tenant.id === current?.id && <Check className="text-foreground!" />}
          </MenuLink>
        ))}
        {tenants.length > 8 && <MenuLink to="/" activeOptions={{ exact: true }} onClick={onNavigate}><Layers />Все пространства ({tenants.length})</MenuLink>}
        {can('workspaces.create') && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { void navigate({ to: '/', search: { new: true } }); onNavigate?.() }}><Plus />Новое пространство</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { me, signOut } = useSession()
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
          <DropdownMenuLabel className="truncate">{subtitle}</DropdownMenuLabel>
          <MenuLink to="/settings" onClick={onNavigate}><Settings2 />Мои настройки</MenuLink>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void signOut()}><LogOut />Выйти</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** Workspace switcher entry as a real router link (middle-click opens a new tab). */
// Base UI keeps the menu open after a link item by default (it expects a full page load); in-app navigation must close it.
const MenuLink = createLink((props: ComponentProps<typeof DropdownMenuLinkItem>) => <DropdownMenuLinkItem closeOnClick {...props} />)

/** Sidebar entry; `NavItem` wraps it into a typed router link. A disabled link (no workspace yet) gets no href. */
function NavAnchor({ icon: Icon, label, active, collapsed, tour, className, disabled: _disabled, ...anchor }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>; icon: typeof Layers; label: string; active: boolean; collapsed: boolean
  /** Set by the router link; already expressed as `aria-disabled` and a missing href, and not a valid `<a>` attribute. */
  disabled?: boolean
  /** `data-tour` anchor for the onboarding tour (lib/onboarding.ts). */
  tour?: string
}) {
  return (
    <a {...anchor} data-tour={tour} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
      className={cn('relative flex h-8 items-center gap-2.5 overflow-hidden rounded-lg pr-2.5 pl-3.5 text-[13px] font-medium text-sidebar-foreground no-underline transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-foreground hover:no-underline aria-disabled:pointer-events-none aria-disabled:opacity-40',
        active && 'text-foreground', className)}>
      {/* Shared layout highlight slides between items instead of blinking. */}
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-sidebar-accent"
        transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <Icon className={cn('relative size-4 flex-none', active ? 'text-foreground' : 'text-sidebar-muted')} />
      <Reveal show={!collapsed} className="relative truncate">{label}</Reveal>
    </a>
  )
}
const NavItem = createLink(NavAnchor)

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
