import { useEffect, useState } from 'react'
import { getAdminKey, setAdminKey } from './api.ts'
import { BrandMark, Icon } from './components/icons.tsx'
import { Button, EmptyState } from './components/ui.tsx'
import { navigate, useRoute } from './lib.ts'
import { Catalog } from './pages/Catalog.tsx'
import { Connection } from './pages/Connection.tsx'
import { Login } from './pages/Login.tsx'
import { Workspace } from './pages/Workspace.tsx'
import { Workspaces } from './pages/Workspaces.tsx'

function useAdminKey(): string | null {
  const [key, setKey] = useState(getAdminKey)
  useEffect(() => {
    const update = () => setKey(getAdminKey())
    window.addEventListener('admin-key-changed', update)
    return () => window.removeEventListener('admin-key-changed', update)
  }, [])
  return key
}

export default function App() {
  const key = useAdminKey()
  const route = useRoute()
  if (!key) return <Login />

  let page
  const [section, id, sub, subId] = route
  if (route.length === 0) page = <Workspaces />
  else if (section === 'integrations' && route.length === 1) page = <Catalog />
  else if (section === 'tenants' && id && !sub) page = <Workspace key={id} tenantId={id} />
  else if (section === 'tenants' && id && sub === 'connections' && subId) page = <Connection key={subId} tenantId={id} connectionId={subId} />
  else page = <EmptyState title="Страница не найдена" action={<Button onClick={() => navigate('/')}>К пространствам</Button>} />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><BrandMark /></span>
          <div>
            <div className="brand-name">CRM Analytics</div>
            <div className="brand-sub">Администрирование</div>
          </div>
        </div>
        <nav className="nav" aria-label="Разделы">
          <span className="nav-label">Управление</span>
          <a href="#/" className={section !== 'integrations' ? 'active' : ''}><Icon name="workspaces" />Пространства</a>
          <a href="#/integrations" className={section === 'integrations' ? 'active' : ''}><Icon name="plug" />Интеграции</a>
        </nav>
        <div className="sidebar-foot">
          <p className="hint">Режим оператора. Доступ к CRM — только чтение.</p>
          <Button icon="logout" size="sm" onClick={() => setAdminKey(null)}>Выйти</Button>
        </div>
      </aside>
      <main className="main"><div className="content">{page}</div></main>
    </div>
  )
}
