import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { dialogSpring, exitFast } from '@/lib/motion'
import { eligibleSteps, OnboardingContext, type TourContext, type TourStep, WELCOME_ID } from '@/lib/onboarding'
import { useCan, useSession } from '@/lib/session'
import { LAST_TENANT_KEY, readStorage } from '@/lib/storage'
import { useToast } from '@/lib/toast'

// The presentation and the tour are separate chunks: most sessions never open them.
const Welcome = lazy(() => import('@/components/onboarding/Welcome').then(module => ({ default: module.Welcome })))
const Tour = lazy(() => import('@/components/onboarding/Tour').then(module => ({ default: module.Tour })))

/**
 * Workspace the tour talks about: the last opened one if it has connections (there is something to show), else the
 * one with the most connections, else the last opened or first one (the tour then points at empty states).
 */
async function tourContext(): Promise<TourContext> {
  try {
    const tenants = await api.tenants()
    const last = tenants.find(tenant => tenant.id === readStorage(LAST_TENANT_KEY))
    const richest = [...tenants].sort((a, b) => b.connections - a.connections)[0]
    const pick = last && last.connections > 0 ? last : richest && richest.connections > 0 ? richest : last ?? tenants[0]
    return { tenantId: pick?.id ?? null }
  } catch {
    return { tenantId: null } // the tour still covers the sections that need no workspace
  }
}

/**
 * Decides what onboarding to show (docs/onboarding.md#lifecycle):
 * first sign-in → presentation → optional tour; later, steps added since → a «Новое» prompt; any time → user menu.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { me } = useSession()
  const can = useCan()
  const toast = useToast()
  const router = useRouter()
  const tracked = me.onboarding !== null // the service key has no stored state; replays still work
  const [seen, setSeen] = useState<string[]>(me.onboarding?.seen ?? [])
  const [welcome, setWelcome] = useState(() => tracked && !me.onboarding!.seen.includes(WELCOME_ID))
  // Stays mounted after the first showing so closing can animate; the run number restarts a replay from slide one.
  const [welcomeRun, setWelcomeRun] = useState(() => (welcome ? 1 : 0))
  const [tour, setTour] = useState<{ steps: TourStep[]; context: TourContext; from: string } | null>(null)
  const [fresh, setFresh] = useState<{ steps: TourStep[]; context: TourContext } | null>(null)
  const [canTour, setCanTour] = useState(true)

  const mark = useCallback((ids: string[]) => {
    if (!tracked || ids.length === 0) return
    // Not critical: if this fails, the same steps are simply offered again next time.
    api.markOnboarding(ids).then(setSeen, () => undefined)
  }, [tracked])

  // While the presentation is open, learn whether there is anything to tour (decides the closing slide's buttons).
  useEffect(() => {
    if (!welcome) return
    let active = true
    tourContext().then(context => { if (active) setCanTour(eligibleSteps(context, can).length > 0) })
    return () => { active = false }
  }, [welcome, can])

  // «Новое»: steps added (or newly permitted) since the user last saw the tour.
  useEffect(() => {
    if (!tracked || welcome || tour || !seen.includes(WELCOME_ID)) return
    let active = true
    tourContext().then(context => {
      const steps = eligibleSteps(context, can).filter(step => !seen.includes(step.id))
      if (active) setFresh(steps.length > 0 ? { steps, context } : null)
    })
    return () => { active = false }
  }, [tracked, welcome, tour, seen, can])

  const startTour = useCallback(async (only?: { steps: TourStep[]; context: TourContext }) => {
    setFresh(null)
    const context = only?.context ?? await tourContext()
    const steps = only?.steps ?? eligibleSteps(context, can)
    if (steps.length === 0) { toast.show('Для вашей роли тур пока пуст.'); return }
    setTour({ steps, context, from: router.state.location.href })
  }, [can, toast, router])

  const finishTour = useCallback((completed: boolean) => {
    if (!tour) return
    mark(tour.steps.map(step => step.id))
    // Return to where the tour started, so it never leaves the user somewhere unexpected.
    if (router.state.location.href !== tour.from) router.history.push(tour.from)
    setTour(null)
    toast.show(completed ? 'Тур пройден. Повторить его можно в «Моих настройках».' : 'Тур можно повторить в «Моих настройках».')
  }, [tour, mark, toast, router])

  const closeWelcome = useCallback(async (then: 'tour' | 'work') => {
    setWelcome(false)
    if (then === 'tour') { mark([WELCOME_ID]); await startTour(); return }
    // Skipping counts as «offered»: the user is not nagged about steps that existed when they declined.
    const context = await tourContext()
    mark([WELCOME_ID, ...eligibleSteps(context, can).map(step => step.id)])
  }, [mark, startTour, can])

  const value = useMemo(() => ({
    showWelcome: () => { setWelcomeRun(run => run + 1); setWelcome(true) },
    startTour: () => startTour(),
  }), [startTour])
  const name = me.user?.name ?? 'коллега'

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {welcomeRun > 0 && (
          <Welcome key={welcomeRun} open={welcome} name={name} canTour={canTour}
            onTour={() => void closeWelcome('tour')} onSkip={() => void closeWelcome('work')} />
        )}
        {tour && <Tour key={tour.from + tour.steps.length} steps={tour.steps} context={tour.context} onFinish={finishTour} />}
      </Suspense>
      <AnimatePresence>
        {fresh && !tour && !welcome && (
          <motion.div role="status" className="fixed right-4 bottom-4 left-4 z-50 grid gap-3 rounded-2xl bg-card p-4 text-card-foreground shadow-pop ring-1 ring-border sm:left-auto sm:w-[340px]"
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, transition: dialogSpring }}
            exit={{ opacity: 0, y: 8, transition: exitFast }}>
            <div className="flex gap-3">
              <span className="grid size-8 flex-none place-items-center rounded-lg bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">Новое в админке</div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {fresh.steps.slice(0, 3).map(step => step.title).join(', ')}{fresh.steps.length > 3 ? ` и ещё ${fresh.steps.length - 3}` : ''}.
                  Показать, где это?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { mark(fresh.steps.map(step => step.id)); setFresh(null) }}>Скрыть</Button>
              <Button onClick={() => void startTour(fresh)}>Показать</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </OnboardingContext.Provider>
  )
}
