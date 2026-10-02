import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Me, SESSION_EXPIRED } from '@/lib/api'
import { SessionContext } from '@/lib/session'
import { Login } from '@/pages/Login'

/** Loads /v1/me once; shows the sign-in screen when there is no session or it expires. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const reload = useCallback(async () => {
    try { setMe(await api.me()) } catch { setMe(null) }
  }, [])
  useEffect(() => {
    api.me().then(setMe, () => setMe(null))
    const expired = () => setMe(null)
    window.addEventListener(SESSION_EXPIRED, expired)
    return () => window.removeEventListener(SESSION_EXPIRED, expired)
  }, [reload])
  const signOut = useCallback(async () => {
    try { await api.logout() } finally { setMe(null) }
  }, [])
  const value = useMemo(() => (me ? { me, reload, signOut } : null), [me, reload, signOut])
  if (me === undefined) return <div className="grid min-h-full place-items-center text-muted-foreground" aria-busy="true" />
  if (!value) return <Login onSignedIn={reload} />
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
