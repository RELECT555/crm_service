import { useState, type ReactNode } from 'react'
import { Layers, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plug } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { api, setAdminKey } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

const COLLAPSE_KEY = 'crm-sidebar-collapsed'

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

/** Desktop: sticky, collapsible to icons. Mobile: top bar with a left sheet holding the same content. */
export function Sidebar({ route }: { route: string[] }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggle = () => {
    const next = !collapsed
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* preference lasts for this page */ }
    setCollapsed(next)
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
        collapsed ? 'w-[72px]' : 'w-[264px]')}>
        <SidebarContent route={route} collapsed={collapsed} onToggle={toggle} />
      </aside>
    </>
  )
}

function SidebarContent({ route, collapsed, onToggle, onNavigate }: {
  route: string[]; collapsed: boolean; onToggle?: () => void; onNavigate?: () => void
}) {
  const [section, currentId] = route
  const tenants = useResource(() => api.tenants(), [section, currentId])
  const recent = tenants.data?.slice(0, 6) ?? []
  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden px-3 py-4">
      <div className={cn('mb-5 flex items-center', collapsed ? 'justify-center' : 'justify-between px-1.5')}>
        <Brand compact={collapsed} />
      </div>

      <NavItem href="#/" icon={Layers} label="Пространства" collapsed={collapsed} onNavigate={onNavigate}
        active={section !== 'integrations' && !(section === 'tenants' && recent.some(tenant => tenant.id === currentId))} />
      <NavItem href="#/integrations" icon={Plug} label="Интеграции" collapsed={collapsed} onNavigate={onNavigate}
        active={section === 'integrations'} />

      {!collapsed && recent.length > 0 && (
        <div className="mt-5 min-h-0 animate-fade">
          <div className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-sidebar-muted uppercase">Недавние</div>
          <div className="grid gap-0.5">
            {recent.map(tenant => {
              const name = tenant.name ?? 'Без названия'
              const active = section === 'tenants' && currentId === tenant.id
              return (
                <a key={tenant.id} href={`#/tenants/${tenant.id}`} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                  className={cn('group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent hover:no-underline',
                    active && 'bg-sidebar-accent font-medium text-sidebar-active')}>
                  <span className={cn('grid size-5 flex-none place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground transition-colors',
                    active && 'bg-primary text-primary-foreground')}>{initials(name)}</span>
                  <span className="truncate">{name}</span>
                  {tenant.attention > 0 && <span className="ml-auto size-1.5 flex-none rounded-full bg-destructive" title="Есть подключения, требующие внимания" />}
                </a>
              )
            })}
          </div>
        </div>
      )}

      <div className={cn('mt-auto grid grid-cols-[minmax(0,1fr)] gap-3 border-t pt-4', collapsed && 'justify-items-center')}>
        <ThemeSwitch compact={collapsed} />
        <div className={cn('flex items-center gap-2.5', !collapsed && 'px-1')}>
          {!collapsed && (
            <>
              <span className="grid size-8 flex-none place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">ОП</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">Оператор</div>
                <div className="truncate text-xs text-sidebar-muted">Только чтение CRM</div>
              </div>
            </>
          )}
          <IconButton label="Выйти" onClick={() => setAdminKey(null)}><LogOut className="size-4" /></IconButton>
        </div>
        {onToggle && (
          <IconButton label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} onClick={onToggle} wide={!collapsed}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /><span className="text-[13px]">Свернуть</span></>}
          </IconButton>
        )}
      </div>
    </div>
  )
}

function NavItem({ href, icon: Icon, label, active, collapsed, onNavigate }: {
  href: string; icon: typeof Layers; label: string; active: boolean; collapsed: boolean; onNavigate?: () => void
}) {
  return (
    <a href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
      className={cn('relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-sidebar-foreground no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:no-underline',
        collapsed ? 'justify-center px-0' : 'px-3',
        active && 'bg-sidebar-accent text-sidebar-active')}>
      {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] animate-fade rounded-full bg-primary" />}
      <Icon className={cn('size-[18px] flex-none', active ? 'text-primary' : 'text-sidebar-muted')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  )
}

function IconButton({ label, onClick, wide, children }: { label: string; onClick: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cn('flex h-9 items-center gap-2 rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-foreground',
        wide ? 'w-full px-3' : 'w-9 justify-center')}>
      {children}
    </button>
  )
}

function initials(name: string): string {
  const letters = name.replace(/[«»"'()]/g, '').split(/\s+/).filter(word => word && !/^(ооо|ао|зао|пао|ип|llc|inc)$/i.test(word))
  return (letters.slice(0, 2).map(word => word[0]).join('') || name.slice(0, 2)).toUpperCase()
}
