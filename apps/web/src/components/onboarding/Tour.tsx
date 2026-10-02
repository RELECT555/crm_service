import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TourContext, TourStep } from '@/lib/onboarding'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'

// Guided tour (docs/onboarding.md#tour): a spotlight cut out of a dimmed page plus a card that glides between targets.
// Targets are found by `data-tour` attributes. If a page step's target never appears (e.g. analytics without data), the
// step is skipped; a sidebar step without a target shows a centered card.

type Box = { x: number; y: number; width: number; height: number }

const PAD = 6
const GAP = 14
const MARGIN = 16
const WAIT_MS = 2500

const visible = (element: Element) => {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** The step's target, or — for sidebar targets on phones — the menu button that opens the sidebar. */
function findTarget(step: TourStep): HTMLElement | null {
  const own = [...document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)].find(visible)
  if (own || !step.nav) return own ?? null
  return [...document.querySelectorAll<HTMLElement>('[data-tour="menu"]')].find(visible) ?? null
}

function hole(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect()
  // Clamp to the viewport so a card taller than the screen still gets a visible outline.
  const x = Math.max(rect.left - PAD, 4)
  const y = Math.max(rect.top - PAD, 4)
  const right = Math.min(rect.right + PAD, window.innerWidth - 4)
  const bottom = Math.min(rect.bottom + PAD, window.innerHeight - 4)
  return { x, y, width: Math.max(right - x, 0), height: Math.max(bottom - y, 0) }
}

/** Where the card goes: beside the target if it fits (right, bottom, top, left), else docked at the bottom or top edge. */
function place(target: Box | null, card: { width: number; height: number }): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - card.width - MARGIN)
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - card.height - MARGIN)
  if (!target) return { x: (vw - card.width) / 2, y: (vh - card.height) / 2 }
  if (vw < 640) {
    // Phones: the card spans the width; it sits on the half of the screen the target does not use.
    const below = target.y + target.height / 2 < vh / 2
    return { x: MARGIN, y: below ? vh - card.height - MARGIN : MARGIN }
  }
  if (target.x + target.width + GAP + card.width <= vw - MARGIN) return { x: target.x + target.width + GAP, y: clampY(target.y) }
  if (target.y + target.height + GAP + card.height <= vh - MARGIN) return { x: clampX(target.x), y: target.y + target.height + GAP }
  if (target.y - GAP - card.height >= MARGIN) return { x: clampX(target.x), y: target.y - GAP - card.height }
  if (target.x - GAP - card.width >= MARGIN) return { x: target.x - GAP - card.width, y: clampY(target.y) }
  return { x: clampX(target.x + target.width / 2 - card.width / 2), y: vh - card.height - MARGIN }
}

function currentPath(): string {
  return window.location.hash.replace(/^#/, '').split('?')[0] || '/'
}

export function Tour({ steps, context, onFinish }: {
  steps: TourStep[]; context: TourContext; onFinish: (completed: boolean) => void
}) {
  const reduce = !!useReducedMotion()
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [searching, setSearching] = useState(true)
  const [box, setBox] = useState<Box | null>(null)
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  // The first placement jumps into position; later steps glide (set once the card has faded in).
  const [glides, setGlides] = useState(false)
  // Set when the tour ends: everything fades out, then the parent unmounts it.
  const [leaving, setLeaving] = useState<boolean | null>(null)
  const [direction, setDirection] = useState(1)
  const step = steps[index]
  const last = index === steps.length - 1

  // Find the target: open the step's page first, then wait until the element exists and stops moving (page transitions).
  useEffect(() => {
    let frame = 0
    let previous = ''
    let cancelled = false
    const path = step.route?.(context)
    if (path && currentPath() !== path) navigate(path)
    const started = performance.now()
    const poll = () => {
      if (cancelled) return
      const element = findTarget(step)
      if (element) {
        const rect = element.getBoundingClientRect()
        const key = `${rect.x}|${rect.y}|${rect.width}|${rect.height}`
        if (key === previous) {
          const fits = rect.top >= MARGIN && rect.bottom <= window.innerHeight - MARGIN
          if (!fits) element.scrollIntoView({ block: rect.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: reduce ? 'auto' : 'smooth' })
          setTarget(element)
          setSearching(false)
          return
        }
        previous = key
      }
      if (performance.now() - started > WAIT_MS) {
        if (step.route) {
          // Content that this workspace does not have: move on in the direction the user is going.
          const next = index + direction
          if (next >= steps.length) setLeaving(true)
          else if (next < 0) setDirection(1)
          else setIndex(next)
          return
        }
        setTarget(null)
        setSearching(false)
        return
      }
      frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [step, context, reduce, index, direction, steps.length])

  // Follow the target while the page scrolls, resizes or the element changes size.
  useEffect(() => {
    if (searching) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBox(target && target.isConnected ? hole(target) : null))
    }
    measure()
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    window.addEventListener('resize', measure)
    const observer = target ? new ResizeObserver(measure) : null
    if (target) observer!.observe(target)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [target, searching])

  // The portal mounts the card after this component, so measure through a callback ref.
  const cardRef = useCallback((card: HTMLDivElement | null) => {
    if (!card) return
    const observer = new ResizeObserver(() => setCardSize({ width: card.offsetWidth, height: card.offsetHeight }))
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null
      if (next === null || next < 0 || next >= steps.length) return
      event.preventDefault()
      setSearching(true)
      setDirection(next > index ? 1 : -1)
      setIndex(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, steps.length])

  useEffect(() => { nextRef.current?.focus({ preventScroll: true }) }, [index])

  useEffect(() => {
    if (leaving === null) return
    const timer = window.setTimeout(() => onFinish(leaving), reduce ? 0 : 240)
    return () => window.clearTimeout(timer)
  }, [leaving, onFinish, reduce])

  const go = (next: number) => {
    if (next >= steps.length) { setLeaving(true); return }
    setSearching(true)
    setDirection(next > index ? 1 : -1)
    setIndex(Math.max(next, 0))
  }
  // The card shows the new step at once and glides when its target is found; the spotlight follows the same target.
  const ready = cardSize !== null
  const position = cardSize ? place(box, cardSize) : { x: 0, y: 0 }
  const glide = reduce || !glides ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 34 }
  const spot = box ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, width: 0, height: 0 }

  return (
    <Dialog.Root open modal="trap-focus" disablePointerDismissal onOpenChange={open => { if (!open && leaving === null) setLeaving(false) }}>
      <Dialog.Portal>
        {/* Blocks the page: the tour shows where things are; it does not click them for you. */}
        <div className="fixed inset-0 z-[60]" aria-hidden="true" />
        <motion.div aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-[60] rounded-xl shadow-[0_0_0_200vmax_var(--scrim)]"
          initial={{ opacity: 0, x: spot.x, y: spot.y, width: spot.width, height: spot.height }}
          animate={{ opacity: leaving === null ? 1 : 0, x: spot.x, y: spot.y, width: spot.width, height: spot.height }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 32, opacity: { duration: 0.3 } }}>
          {box && (
            <motion.span className="absolute inset-0 rounded-xl ring-2 ring-primary"
              animate={reduce ? undefined : { opacity: [0.9, 0.35, 0.9] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
          )}
        </motion.div>

        <Dialog.Popup
          ref={cardRef}
          initialFocus={nextRef}
          render={<motion.div initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: ready && leaving === null ? 1 : 0, scale: ready && leaving === null ? 1 : 0.96, x: position.x, y: position.y }}
            transition={{ opacity: { duration: 0.2 }, scale: { duration: 0.25 }, x: glide, y: glide }}
            onAnimationComplete={() => { if (ready && !glides) setGlides(true) }} />}
          className={cn('fixed top-0 left-0 z-[61] grid gap-4 rounded-2xl bg-card p-5 text-card-foreground shadow-pop ring-1 ring-border outline-none',
            'w-[calc(100vw-32px)] sm:w-[360px]')}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground tabular-nums">Шаг {index + 1} из {steps.length}</span>
            <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Завершить тур" className="-mr-1.5" />}><X /></Dialog.Close>
          </div>
          <div aria-live="polite" className="grid">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={step.id} className="grid gap-1.5 [grid-area:1/1]"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, delay: 0.05 } }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-tight">{step.title}</Dialog.Title>
                <Dialog.Description className="text-[13.5px] leading-relaxed text-muted-foreground">{step.body}</Dialog.Description>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <motion.div className="h-full rounded-full bg-primary" initial={false}
              animate={{ width: `${((index + 1) / steps.length) * 100}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            {index > 0
              ? <Button variant="ghost" onClick={() => go(index - 1)}><ArrowLeft />Назад</Button>
              : <span className="hidden text-xs text-muted-foreground sm:inline">Стрелки ← → тоже работают</span>}
            <Button ref={nextRef} onClick={() => go(index + 1)}>
              {last ? 'Готово' : <>Далее<ArrowRight /></>}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
