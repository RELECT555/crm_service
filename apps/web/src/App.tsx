import { lazy, Suspense, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sidebar } from '@/components/Sidebar'
import { EmptyState, LoadingRows } from '@/components/common'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pageTransition } from '@/lib/motion'
import { navigate, useRoute } from '@/lib/router'
import { type Permission, useCan } from '@/lib/session'
import { Workspaces } from '@/pages/Workspaces'

// Every page except the start page is its own chunk, so the first paint does not wait for screens nobody opened.
const Analytics = lazy(() => import('@/pages/Analytics').then(module => ({ default: module.Analytics })))
const Audit = lazy(() => import('@/pages/Audit').then(module => ({ default: module.Audit })))
const Catalog = lazy(() => import('@/pages/Catalog').then(module => ({ default: module.Catalog })))
const Connection = lazy(() => import('@/pages/Connection').then(module => ({ default: module.Connection })))
const Roles = lazy(() => import('@/pages/Roles').then(module => ({ default: module.Roles })))
const Users = lazy(() => import('@/pages/Users').then(module => ({ default: module.Users })))
const Workspace = lazy(() => import('@/pages/Workspace').then(module => ({ default: module.Workspace })))

/** Hash routes. Each page declares the permission it needs; the server enforces the same rule on its API. */
function resolve(route: string[]): { page: ReactNode; permission?: Permission; tenantId?: string } {
  const [section, id, sub, subId] = route
  if (route.length === 0) return { page: <Workspaces /> }
  if (section === 'integrations' && route.length === 1) return { page: <Catalog /> }
  if (section === 'users' && route.length === 1) return { page: <Users />, permission: 'users.manage' }
  if (section === 'roles' && route.length === 1) return { page: <Roles />, permission: 'users.manage' }
  if (section === 'audit' && route.length === 1) return { page: <Audit />, permission: 'audit.view' }
  if (section === 'tenants' && id && !sub) return { page: <Workspace tenantId={id} />, permission: 'workspaces.view', tenantId: id }
  if (section === 'tenants' && id && sub === 'analytics' && !subId) return { page: <Analytics tenantId={id} />, permission: 'analytics.view', tenantId: id }
  if (section === 'tenants' && id && sub === 'connections' && subId) {
    return { page: <Connection tenantId={id} connectionId={subId} />, permission: 'workspaces.view', tenantId: id }
  }
  return { page: <EmptyState title="Страница не найдена" action={<Button variant="outline" size="lg" onClick={() => navigate('/')}>К пространствам</Button>} /> }
}

export default function App() {
  const route = useRoute()
  const can = useCan()
  const { page, permission, tenantId } = resolve(route)
  const allowed = !permission || can(permission, tenantId)
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar route={route} />
      <main className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={route.join('/')} className="mx-auto max-w-[1600px] px-4 pt-5 pb-12 sm:px-6 sm:pt-7 lg:px-10 lg:pt-8 lg:pb-16 2xl:px-14"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: pageTransition }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            {allowed ? <Suspense fallback={<Card><LoadingRows rows={5} /></Card>}>{page}</Suspense> : (
              <EmptyState title="Нет доступа" action={<Button variant="outline" size="lg" onClick={() => navigate('/')}>К пространствам</Button>}>
                У вашей роли нет права открыть этот раздел. Обратитесь к администратору.
              </EmptyState>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
