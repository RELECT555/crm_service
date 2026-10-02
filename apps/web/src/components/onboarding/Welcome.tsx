import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { BrandMark } from '@/components/Brand'
import { AxesVisual, ConnectVisual, HeroVisual, RolesVisual, SignalsVisual } from '@/components/onboarding/visuals'
import { cn } from '@/lib/utils'

// Welcome presentation (docs/onboarding.md#presentation): a full-screen, keynote-style sequence of slides.
// Base UI Dialog owns focus trapping, Escape and scroll lock; Motion owns every visual.

type Title = Array<string | { accent: string }>
type Slide = { id: string; eyebrow: string; title: Title; text?: string; visual?: ReactNode; light: string }

function slides(firstName: string): Slide[] {
  return [
    { id: 'hello', eyebrow: 'CRM Analytics', title: [`Привет, ${firstName}.`, 'Посмотрим, как работает', { accent: 'ваша команда.' }],
      text: 'Пара слайдов о том, что здесь есть, — и за дело.', visual: <HeroVisual />, light: 'var(--primary)' },
    { id: 'axes', eyebrow: 'Две оси', title: ['Результат.', { accent: 'И работа,' }, 'которая к нему ведёт.'],
      text: 'Сделки и закупки — с одной стороны. Звонки, встречи, задачи и визиты — с другой. По каждому менеджеру, рядом.',
      visual: <AxesVisual />, light: 'var(--series-1)' },
    { id: 'connect', eyebrow: 'Подключение', title: ['Ваша CRM\u00a0—', { accent: 'за пару минут.' }],
      text: 'Вход через официальную авторизацию CRM. Данные загружаются и обновляются автоматически.',
      visual: <ConnectVisual />, light: 'var(--series-3)' },
    { id: 'signals', eyebrow: 'Слабые места', title: ['Видно, кому', { accent: 'чего не хватает.' }],
      text: 'Каждый сравнивается с медианой команды. Не догадки — объяснение, что именно не так.',
      visual: <SignalsVisual />, light: 'var(--series-4)' },
    { id: 'roles', eyebrow: 'Доступ', title: ['Каждому\u00a0—', { accent: 'ровно свои права.' }],
      text: 'Пять ролей по нарастающей, свои роли из отдельных прав и журнал всех изменений.',
      visual: <RolesVisual />, light: 'var(--series-5)' },
  ]
}

const ease = [0.16, 1, 0.3, 1] as const

function Headline({ title, reduce }: { title: Title; reduce: boolean }) {
  // Word-by-word reveal: each word rises out of a blur. Accent phrases reveal as one unit so their gradient stays continuous.
  const word: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }
    : { hidden: { opacity: 0, y: '0.45em', filter: 'blur(14px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease } } }
  const units = title.flatMap(part => (typeof part === 'string' ? part.split(' ').map(text => ({ text, accent: false })) : [{ text: part.accent, accent: true }]))
  return (
    <motion.h2 className="mx-auto max-w-4xl text-[clamp(2.1rem,6vw,4.6rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance text-foreground"
      variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}>
      {units.map((unit, index) => (
        <Fragment key={index}>
          <motion.span variants={word}
            className={cn('inline-block', unit.accent && 'bg-linear-to-r from-series-1 via-primary to-series-5 bg-clip-text pb-[0.08em] text-transparent')}>
            {unit.text}
          </motion.span>{' '}
        </Fragment>
      ))}
    </motion.h2>
  )
}

export function Welcome({ open, name, canTour, onTour, onSkip }: {
  open: boolean; name: string; canTour: boolean; onTour: () => void; onSkip: () => void
}) {
  const reduce = !!useReducedMotion()
  const deck = slides(name.split(/\s+/)[0] || name)
  const total = deck.length + 1 // + the closing slide
  const [[index, direction], setPage] = useState<[number, number]>([0, 1])
  const go = useCallback((next: number) => {
    setPage(([current]) => (next < 0 || next >= total || next === current ? [current, 0] : [next, next > current ? 1 : -1]))
  }, [total])
  const last = index === total - 1
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); go(index + 1) }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(index - 1) }
    }
    // Capture phase: Base UI's focus management handles keys on the popup before they would bubble to window.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, index, go])

  const slide = deck[index]
  // `custom` carries the direction so the leaving slide exits away from the one coming in (both read the latest value).
  const page: Variants = {
    enter: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * 60, scale: 0.98, filter: 'blur(10px)' }),
    center: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.6, ease } },
    exit: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * -60, scale: 0.98, filter: 'blur(10px)', transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }),
  }

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onSkip() }}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Popup
              initialFocus={nextRef}
              render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.5 } }}
                exit={{ opacity: 0, scale: reduce ? 1 : 1.03, filter: reduce ? 'none' : 'blur(8px)', transition: { duration: 0.45, ease } }} />}
              className="dark fixed inset-0 z-[70] flex flex-col overflow-hidden bg-stage text-foreground outline-none">
              <Dialog.Title className="sr-only">Знакомство с CRM Analytics</Dialog.Title>

              {/* One soft light per slide, cross-fading and drifting slowly behind the content. */}
              <AnimatePresence initial={false}>
                <motion.div key={last ? 'final' : slide.id} aria-hidden="true"
                  className="pointer-events-none absolute top-[-30vmax] left-1/2 size-[90vmax] -translate-x-1/2 rounded-full blur-3xl"
                  style={{ background: `radial-gradient(closest-side, color-mix(in oklch, ${last ? 'var(--primary)' : slide.light} 30%, transparent), transparent)` }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1, y: reduce ? 0 : [0, 24, 0] }} exit={{ opacity: 0 }}
                  transition={{ opacity: { duration: 1.2 }, y: { duration: 14, repeat: Infinity, ease: 'easeInOut' } }} />
              </AnimatePresence>

              <header className="relative flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
                <span className="flex items-center gap-2.5 text-[14px] font-semibold tracking-tight">
                  <BrandMark className="bg-foreground text-stage" />CRM Analytics
                </span>
                {!last && (
                  <button type="button" onClick={onSkip}
                    className="rounded-full px-3 py-1.5 text-[13px] text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none">
                    Пропустить
                  </button>
                )}
              </header>

              <motion.main className="relative flex flex-1 touch-pan-y items-center justify-center overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"
                onPanEnd={(_, info) => { if (info.offset.x < -70) go(index + 1); else if (info.offset.x > 70) go(index - 1) }}>
                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.section key={index} className="grid w-full max-w-5xl justify-items-center gap-6 text-center sm:gap-12"
                    custom={direction} variants={page} initial="enter" animate="center" exit="exit"
                    aria-roledescription="слайд" aria-label={`${index + 1} из ${total}`}>
                    {last ? <Closing reduce={reduce} canTour={canTour} onTour={onTour} onSkip={onSkip} /> : (
                      <>
                        <motion.div className="grid gap-5" initial="hidden" animate="show">
                          <motion.p className="text-[13px] font-medium tracking-[0.18em] text-foreground/50 uppercase"
                            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.6 } } }}>
                            {slide.eyebrow}
                          </motion.p>
                          <Headline title={slide.title} reduce={reduce} />
                          {slide.text && (
                            <motion.p className="mx-auto max-w-2xl text-[clamp(1rem,1.6vw,1.25rem)] leading-relaxed text-pretty text-foreground/60"
                              variants={{ hidden: { opacity: 0, y: reduce ? 0 : 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.55, ease } } }}>
                              {slide.text}
                            </motion.p>
                          )}
                        </motion.div>
                        {slide.visual && (
                          <motion.div className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.25, duration: 0.6 } }}>
                            {slide.visual}
                          </motion.div>
                        )}
                      </>
                    )}
                  </motion.section>
                </AnimatePresence>
              </motion.main>

              <footer className="relative flex items-center justify-between gap-4 px-5 pb-5 sm:px-8 sm:pb-7">
                <NavButton label="Назад" onClick={() => go(index - 1)} hidden={index === 0}><ArrowLeft /></NavButton>
                <div className="flex items-center gap-1.5" role="group" aria-label="Слайды">
                  {Array.from({ length: total }, (_, dot) => (
                    <button key={dot} type="button" onClick={() => go(dot)} aria-label={`Слайд ${dot + 1}`} aria-current={dot === index ? 'step' : undefined}
                      className="group grid h-6 place-items-center px-0.5 focus-visible:outline-none">
                      <motion.span className="block h-1.5 rounded-full bg-foreground group-focus-visible:ring-2 group-focus-visible:ring-foreground/50"
                        animate={{ width: dot === index ? 28 : 6, opacity: dot === index ? 0.95 : dot < index ? 0.5 : 0.22 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                    </button>
                  ))}
                </div>
                <NavButton ref={nextRef} label="Далее" onClick={() => go(index + 1)} hidden={last} primary><ArrowRight /></NavButton>
              </footer>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

function NavButton({ label, onClick, hidden, primary, children, ref }: {
  label: string; onClick: () => void; hidden?: boolean; primary?: boolean; children: ReactNode; ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <motion.button ref={ref} type="button" onClick={onClick} aria-label={label} disabled={hidden} tabIndex={hidden ? -1 : undefined}
      animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.8 : 1 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
      className={cn('grid size-12 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none disabled:pointer-events-none [&_svg]:size-5',
        primary ? 'bg-foreground text-stage' : 'bg-foreground/10 text-foreground hover:bg-foreground/15')}>
      {children}
    </motion.button>
  )
}

function Closing({ reduce, canTour, onTour, onSkip }: { reduce: boolean; canTour: boolean; onTour: () => void; onSkip: () => void }) {
  return (
    <motion.div className="grid justify-items-center gap-8" initial="hidden" animate="show">
      <Headline title={['Начнём?']} reduce={reduce} />
      <motion.p className="max-w-xl text-[clamp(1rem,1.6vw,1.25rem)] leading-relaxed text-pretty text-foreground/60"
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.4, duration: 0.7 } } }}>
        {canTour ? 'Короткий тур покажет, где что находится. Около минуты, прервать можно в любой момент.' : 'Всё готово к работе.'}
      </motion.p>
      <motion.div className="flex flex-col items-center gap-3 sm:flex-row"
        variants={{ hidden: { opacity: 0, y: reduce ? 0 : 14 }, show: { opacity: 1, y: 0, transition: { delay: 0.6, duration: 0.7, ease } } }}>
        {canTour && (
          <motion.button type="button" onClick={onTour} autoFocus whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="h-12 rounded-full bg-foreground px-7 text-[15px] font-semibold text-stage focus-visible:ring-4 focus-visible:ring-foreground/30 focus-visible:outline-none">
            Пройти тур
          </motion.button>
        )}
        <motion.button type="button" onClick={onSkip} autoFocus={!canTour} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          className={cn('h-12 rounded-full px-7 text-[15px] font-medium focus-visible:ring-4 focus-visible:ring-foreground/30 focus-visible:outline-none',
            canTour ? 'text-foreground/70 hover:bg-foreground/10 hover:text-foreground' : 'bg-foreground font-semibold text-stage')}>
          {canTour ? 'Сразу к работе' : 'Начать работу'}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
