import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown, LayoutGrid, Layers, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Plug, Plus, Sun } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Avatar } from '@/components/common'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuLinkItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { api, setAdminKey, type TenantSummary } from '@/lib/api'
import { navigate } from '@/lib/router'
import { setTheme, type ThemePreference, useTheme } from '@/lib/theme'
import { plural } from '@/lib/format'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const COLLAPSE_KEY = 'crm-sidebar-collapsed'
const LAST_TENANT_KEY = 'crm-last-tenant'

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* preference lasts for this page only */ }
}

/** Desktop: sticky, collapsible to icons. Mobile: top bar with a left sheet holding the same content. */
export function Sidebar({ route }: { route: string[] }) {
  const [collapsed, setCollapsed] = useState(() => readStorage(COLLAPSE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggle = () => {
    writeStorage(COLLAPSE_KEY, collapsed ? '0' : '1')
    setCollapsed(!collapsed)
  }
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-sidebar/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <button type="button" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}
          className="grid size-9 place-items-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent">
          <Menu className="size-5" />
        </button>
      </header>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-sidebar">
          <SheetTitle className="sr-only">Меню</SheetTitle>
          <SidebarContent route={route} collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <aside className={cn('sticky top-0 hidden h-screen flex-none border-r bg-sidebar transition-[width] duration-300 ease-out lg:block',
        collapsed ? 'w-[68px]' : 'w-[256px]')}>
        <SidebarContent route={route} collapsed={collapsed} onToggle={toggle} />
      </aside>
    </>
  )
}

function SidebarContent({ route, collapsed, onToggle, onNavigate }: {
  route: string[]; collapsed: boolean; onToggle?: () => void; onNavigate?: () => void
}) {
  const [section, routeTenant] = route
  const tenants = useResource(() => api.tenants(), [])
  // Refresh in the background on navigation; the switcher keeps showing the last list meanwhile.
  const { reload } = tenants
  useEffect(() => { reload() }, [section, routeTenant, reload])
  useEffect(() => { if (section === 'tenants' && routeTenant) writeStorage(LAST_TENANT_KEY, routeTenant) }, [section, routeTenant])
  const currentId = section === 'tenants' ? routeTenant : readStorage(LAST_TENANT_KEY)
  const current = tenants.data?.find(tenant => tenant.id === currentId) ?? null

  return (
    <div className="flex h-full flex-col px-3 py-3.5">
      <div className={cn('mb-3 flex h-8 items-center', collapsed ? 'justify-center' : 'px-1.5')}>
        <Brand compact={collapsed} />
      </div>

      <WorkspaceSwitcher tenants={tenants.data ?? []} current={current} collapsed={collapsed} onNavigate={onNavigate} />

      <nav aria-label="Разделы" className="mt-4 grid gap-0.5">
        {!collapsed && <div className="px-2.5 pb-1 text-[11px] font-medium text-sidebar-muted">Рабочее пространство</div>}
        <NavItem href={current ? `#/tenants/${current.id}` : '#/'} icon={LayoutGrid} label="Обзор" collapsed={collapsed} onNavigate={onNavigate}
          active={section === 'tenants' && !!routeTenant} disabled={!current} />
        {!collapsed && <div className="px-2.5 pt-4 pb-1 text-[11px] font-medium text-sidebar-muted">Сервис</div>}
        {collapsed && <div className="my-2 h-px bg-sidebar-border" />}
        <NavItem href="#/" icon={Layers} label="Все пространства" collapsed={collapsed} onNavigate={onNavigate} active={route.length === 0} />
        <NavItem href="#/integrations" icon={Plug} label="Интеграции" collapsed={collapsed} onNavigate={onNavigate} active={section === 'integrations'} />
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

function WorkspaceSwitcher({ tenants, current, collapsed, onNavigate }: {
  tenants: TenantSummary[]; current: TenantSummary | null; collapsed: boolean; onNavigate?: () => void
}) {
  const name = current?.name ?? (current ? 'Без названия' : 'Выберите пространство')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('flex h-11 w-full items-center gap-2.5 rounded-xl bg-card text-left shadow-card ring-1 ring-border transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted/60',
          collapsed ? 'justify-center px-0' : 'px-2')}
        title={collapsed ? name : undefined}>
        <Avatar name={current?.name ?? '?'} muted={!current} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {current ? `${current.connections} ${plural(current.connections, 'подключение', 'подключения', 'подключений')}` : `${tenants.length} в сервисе`}
              </span>
            </span>
            <ChevronsUpDown className="size-4 flex-none text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start">
        <DropdownMenuLabel>Пространства</DropdownMenuLabel>
        {tenants.slice(0, 8).map(tenant => (
          <DropdownMenuLinkItem key={tenant.id} href={`#/tenants/${tenant.id}`} onClick={onNavigate}>
            <Avatar name={tenant.name ?? '?'} small />
            <span className="min-w-0 flex-1 truncate">{tenant.name ?? 'Без названия'}</span>
            {tenant.attention > 0 && <span className="size-1.5 rounded-full bg-destructive" title="Есть подключения, требующие внимания" />}
            {tenant.id === current?.id && <Check className="text-foreground!" />}
          </DropdownMenuLinkItem>
        ))}
        {tenants.length > 8 && <DropdownMenuLinkItem href="#/" onClick={onNavigate}><Layers />Все пространства ({tenants.length})</DropdownMenuLinkItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { navigate('/?new=1'); onNavigate?.() }}><Plus />Новое пространство</DropdownMenuItem>
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
  const { preference } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('flex h-11 w-full items-center gap-2.5 rounded-xl text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent',
          collapsed ? 'justify-center px-0' : 'px-2')} title={collapsed ? 'Оператор' : undefined}>
        <span className="grid size-7 flex-none place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">ОП</span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">Оператор</span>
              <span className="block truncate text-[11px] text-muted-foreground">Доступ к CRM — только чтение</span>
            </span>
            <ChevronsUpDown className="size-4 flex-none text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align={collapsed ? 'end' : 'start'} className="w-56">
        <DropdownMenuLabel>Тема</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={value => setTheme(value as ThemePreference)}>
          {THEMES.map(theme => (
            <DropdownMenuRadioItem key={theme.value} value={theme.value} closeOnClick={false}><theme.icon />{theme.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setAdminKey(null)}><LogOut />Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavItem({ href, icon: Icon, label, active, collapsed, disabled, onNavigate }: {
  href: string; icon: typeof Layers; label: string; active: boolean; collapsed: boolean; disabled?: boolean; onNavigate?: () => void
}) {
  return (
    <a href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} aria-disabled={disabled || undefined}
      title={collapsed ? label : undefined}
      className={cn('flex h-8 items-center gap-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground hover:no-underline',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active && 'bg-sidebar-accent text-foreground',
        disabled && 'pointer-events-none opacity-40')}>
      <Icon className={cn('size-4 flex-none', active ? 'text-foreground' : 'text-sidebar-muted')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  )
}

function SidebarButton({ label, collapsed, onClick, icon: Icon }: { label: string; collapsed: boolean; onClick: () => void; icon: typeof Layers }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={collapsed ? label : undefined}
      className={cn('flex h-8 items-center gap-2.5 rounded-lg text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-foreground',
        collapsed ? 'justify-center' : 'px-2.5')}>
      <Icon className="size-4" />{!collapsed && label}
    </button>
  )
}
