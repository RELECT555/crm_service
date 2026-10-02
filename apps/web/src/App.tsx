import { useEffect, useState } from 'react'
import { Layers, LogOut, Plug } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { EmptyState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { getAdminKey, setAdminKey } from '@/lib/api'
import { navigate, useRoute } from '@/lib/router'
import { cn } from '@/lib/utils'
import { Catalog } from '@/pages/Catalog'
import { Connection } from '@/pages/Connection'
import { Login } from '@/pages/Login'
import { Workspace } from '@/pages/Workspace'
import { Workspaces } from '@/pages/Workspaces'

function useAdminKey(): string | null {
  const [key, setKey] = useState(getAdminKey)
  useEffect(() => {
    const update = () => setKey(getAdminKey())
    window.addEventListener('admin-key-changed', update)
    return () => window.removeEventListener('admin-key-changed', update)
  }, [])
  return key
}

function NavLink({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: typeof Layers; children: string }) {
  return (
    <a href={href} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent hover:text-white',
        active && 'bg-sidebar-accent text-white shadow-[inset_2px_0_0_var(--primary)]')}>
      <Icon className="size-[18px] opacity-80" />{children}
    </a>
  )
}

export default function App() {
  const key = useAdminKey()
  const route = useRoute()
  if (!key) return <Login />

  const [section, id, sub, subId] = route
  let page
  if (route.length === 0) page = <Workspaces />
  else if (section === 'integrations' && route.length === 1) page = <Catalog />
  else if (section === 'tenants' && id && !sub) page = <Workspace key={id} tenantId={id} />
  else if (section === 'tenants' && id && sub === 'connections' && subId) page = <Connection key={subId} tenantId={id} connectionId={subId} />
  else page = <EmptyState title="Страница не найдена" action={<Button variant="outline" size="lg" onClick={() => navigate('/')}>К пространствам</Button>} />

  return (
    <div className="grid min-h-full lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-wrap items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:flex-nowrap lg:items-stretch lg:px-3 lg:py-5">
        <div className="lg:px-2 lg:pb-6"><Brand inverted /></div>
        <nav aria-label="Разделы" className="flex gap-1 lg:flex-col">
          <span className="hidden px-3 pt-2 pb-2 text-[11px] font-semibold tracking-[0.08em] text-sidebar-muted uppercase lg:block">Управление</span>
          <NavLink href="#/" active={section !== 'integrations'} icon={Layers}>Пространства</NavLink>
          <NavLink href="#/integrations" active={section === 'integrations'} icon={Plug}>Интеграции</NavLink>
        </nav>
        <div className="ml-auto grid gap-3 lg:mt-auto lg:ml-0 lg:border-t lg:border-sidebar-border lg:pt-4">
          <p className="hidden px-3 text-xs text-sidebar-muted lg:block">Режим оператора. Доступ к CRM — только чтение.</p>
          <Button variant="ghost" onClick={() => setAdminKey(null)}
            className="border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-white lg:h-9 lg:border">
            <LogOut />Выйти
          </Button>
        </div>
      </aside>
      <main className="min-w-0">
        <div className="mx-auto max-w-[1160px] px-4 pt-5 pb-12 sm:px-8 sm:pt-8 sm:pb-16">{page}</div>
      </main>
    </div>
  )
}
