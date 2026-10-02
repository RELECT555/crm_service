import { Link, Outlet, useLocation, useMatches, useParams } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Sidebar } from '@/components/Sidebar'
import { EmptyState } from '@/components/common'
import { PageSkeleton } from '@/components/skeletons'
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider'
import { buttonVariants } from '@/components/ui/button'
import { pageTransition } from '@/lib/motion'
import { useCan } from '@/lib/session'

/** Root route: sidebar + the current page, guarded by the permission the page declares (router.tsx). */
export function Layout() {
  const pathname = useLocation({ select: location => location.pathname })
  const permission = useMatches({ select: matches => matches.findLast(match => match.staticData.permission)?.staticData.permission })
  const { tenantId } = useParams({ strict: false })
  const can = useCan()
  const allowed = !permission || can(permission, tenantId)
  return (
    <OnboardingProvider>
      <div className="flex min-h-full flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <motion.div key={pathname} className="mx-auto max-w-[1600px] px-4 pt-5 pb-12 sm:px-6 sm:pt-7 lg:px-10 lg:pt-8 lg:pb-16 2xl:px-14"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: pageTransition }}>
            {allowed ? <Outlet /> : (
              <EmptyState title="Нет доступа" action={<BackHome />}>
                У вашей роли нет права открыть этот раздел. Обратитесь к администратору.
              </EmptyState>
            )}
          </motion.div>
        </main>
      </div>
    </OnboardingProvider>
  )
}

export function NotFound() {
  return <EmptyState title="Страница не найдена" action={<BackHome />} />
}

/** Shown while a page chunk loads (only if it takes longer than the router's pending delay). */
export function PagePending() {
  return <PageSkeleton />
}

function BackHome() {
  return <Link to="/" activeOptions={{ exact: true }} className={buttonVariants({ variant: 'outline', size: 'lg' })}>К пространствам</Link>
}
