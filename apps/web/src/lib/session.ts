import { createContext, useContext } from 'react'
import type { Me } from '@/lib/api'

/** Permission ids, mirrored from apps/api/src/domain/permissions.ts. */
export type Permission = 'workspaces.view' | 'analytics.view' | 'connections.manage' | 'mappings.manage' | 'workspaces.manage'
  | 'workspaces.create' | 'users.manage' | 'roles.manage' | 'audit.view'

export type Session = { me: Me; reload: () => Promise<void>; signOut: () => Promise<void> }

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside SessionProvider')
  return session
}

/**
 * UI-side mirror of the server rule (docs/access-control.md): global grants apply everywhere; workspace grants
 * only to that workspace. It only hides controls — the server still checks every request.
 */
export function canIn(me: Me, permission: Permission, tenantId?: string): boolean {
  if (me.system || me.permissions.global.includes(permission)) return true
  return !!tenantId && (me.permissions.workspaces[tenantId] ?? []).includes(permission)
}

export function useCan(): (permission: Permission, tenantId?: string) => boolean {
  const { me } = useSession()
  return (permission, tenantId) => canIn(me, permission, tenantId)
}
