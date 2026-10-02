import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { getAdminKey } from '@/lib/api'
import { navigate, useRoute } from '@/lib/router'
import { Sidebar } from '@/components/Sidebar'
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
    <div className="flex min-h-full flex-col lg:flex-row">
      <Sidebar route={route} />
      <main className="min-w-0 flex-1">
        <div key={route.join('/')} className="mx-auto max-w-[1160px] animate-enter px-4 pt-5 pb-12 sm:px-8 sm:pt-8 sm:pb-16">{page}</div>
      </main>
    </div>
  )
}
