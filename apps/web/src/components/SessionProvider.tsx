import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Me, SESSION_EXPIRED } from '@/lib/api'
import { SessionContext } from '@/lib/session'
import { setTheme } from '@/lib/theme'
import { Login } from '@/pages/Login'

/** Loads /v1/me once; shows the sign-in screen when there is no session or it expires. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const reload = useCallback(async () => {
    try { setMe(await api.me()) } catch { setMe(null) }
  }, [])
  useEffect(() => {
    api.me().then(current => { openStartPage(current); setMe(current) }, () => setMe(null))
    const expired = () => setMe(null)
    window.addEventListener(SESSION_EXPIRED, expired)
    return () => window.removeEventListener(SESSION_EXPIRED, expired)
  }, [reload])
  useEffect(() => {
    if (me?.preferences?.theme) setTheme(me.preferences.theme)
  }, [me?.preferences?.theme])
  const signedIn = useCallback(async () => {
    const current = await api.me()
    openStartPage(current)
    setMe(current)
  }, [])
  const signOut = useCallback(async () => {
    try { await api.logout() } finally { setMe(null) }
  }, [])
  const value = useMemo(() => (me ? { me, reload, updateMe: setMe, signOut } : null), [me, reload, signOut])
  if (me === undefined) return <div className="grid min-h-full place-items-center text-muted-foreground" aria-busy="true" />
  if (!value) return <Login onSignedIn={signedIn} />
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** Apply the saved start page only on entry; explicit links and «Все пространства» still work. */
function openStartPage(me: Me): void {
  const preferences = me.preferences
  const hash = window.location.hash
  if (!preferences?.defaultTenantId || (hash && hash !== '#/' && hash !== '#')) return
  const suffix = preferences.landingPage === 'analytics' ? '/analytics' : ''
  window.location.replace(`#/tenants/${preferences.defaultTenantId}${suffix}`)
}
