import { createHashHistory, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { Layout, NotFound, PagePending } from '@/App'
import type { Permission } from '@/lib/session'
import { Workspaces } from '@/pages/Workspaces'

// Route tree of the admin UI. Hash history, so the API serves the build as plain static files (docs/decisions.md #7).
// Each page declares the permission it needs in `staticData`; the layout checks it, the server enforces the same rule.
// Every page except the start page is its own chunk, so the first paint does not wait for screens nobody opened.

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFound })

const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/', component: Workspaces,
  // `#/?new=true` (from the workspace switcher) opens the «Новое пространство» dialog.
  validateSearch: (search: Record<string, unknown>): { new?: true } => (search.new === true ? { new: true } : {}),
})
const catalogRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'integrations', component: lazyRouteComponent(() => import('@/pages/Catalog'), 'Catalog'),
})
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'settings', component: lazyRouteComponent(() => import('@/pages/Settings'), 'Settings'),
})
const usersRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'users', staticData: { permission: 'users.manage' },
  component: lazyRouteComponent(() => import('@/pages/Users'), 'Users'),
})
const rolesRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'roles', staticData: { permission: 'users.manage' },
  component: lazyRouteComponent(() => import('@/pages/Roles'), 'Roles'),
})
const auditRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'audit', staticData: { permission: 'audit.view' },
  component: lazyRouteComponent(() => import('@/pages/Audit'), 'Audit'),
})
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'tenants/$tenantId', staticData: { permission: 'workspaces.view' },
  component: lazyRouteComponent(() => import('@/pages/Workspace'), 'Workspace'),
})
const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'tenants/$tenantId/analytics', staticData: { permission: 'analytics.view' },
  // `?demo=1` (or `?demo=true`) shows the read-only fictional team instead of the workspace data.
  validateSearch: (search: Record<string, unknown>): { demo?: true } => (search.demo === true || search.demo === 1 || search.demo === '1' ? { demo: true } : {}),
  component: lazyRouteComponent(() => import('@/pages/Analytics'), 'Analytics'),
})
// The OAuth callback redirects here (apps/api/src/http/routes/public.ts); keep the path stable.
const connectionRoute = createRoute({
  getParentRoute: () => rootRoute, path: 'tenants/$tenantId/connections/$connectionId', staticData: { permission: 'workspaces.view' },
  component: lazyRouteComponent(() => import('@/pages/Connection'), 'Connection'),
})

const routeTree = rootRoute.addChildren([
  workspacesRoute, catalogRoute, settingsRoute, usersRoute, rolesRoute, auditRoute, workspaceRoute, analyticsRoute, connectionRoute,
])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  // Page chunks start loading when a link is hovered or focused.
  defaultPreload: 'intent',
  defaultPendingComponent: PagePending,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
  interface StaticDataRouteOption {
    /** Permission the page needs; workspace permissions are checked in the `$tenantId` of the URL. */
    permission?: Permission
  }
}
