import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { BrandMark } from '@/components/Brand'
import { AccessPreview, AnalyticsPreview, ConnectPreview, OverviewPreview, SignalsPreview } from '@/components/onboarding/previews'
import { Button } from '@/components/ui/button'
import { dialogSpring, exitFast } from '@/lib/motion'

// Welcome presentation (docs/onboarding.md#presentation): a large dialog in the product's own theme — the story on
// the left, a live preview of the real interface on the right. Base UI Dialog owns focus, Escape and scroll lock.

type Slide = { id: string; eyebrow: string; title: string; text: string; points: string[]; preview: ReactNode }

function slides(firstName: string): Slide[] {
  return [
    { id: 'hello', eyebrow: 'Добро пожаловать', title: `Здравствуйте, ${firstName}`,
      text: 'CRM Analytics забирает данные из CRM клиента и показывает, как работает каждый менеджер: результат и усилия — рядом.',
      points: ['Подключение CRM за пару минут', 'Аналитика по каждому менеджеру', 'Доступ по ролям и журнал действий'],
      preview: <OverviewPreview /> },
    { id: 'connect', eyebrow: 'Подключение', title: 'Подключите CRM клиента',
      text: 'Выберите систему, войдите администратором — загрузка начнётся сама и дальше будет обновляться автоматически.',
      points: ['Официальная авторизация CRM — пароли к нам не попадают', 'Только чтение: в CRM ничего не меняется', 'Видно, что и сколько загружено'],
      preview: <ConnectPreview /> },
    { id: 'analytics', eyebrow: 'Аналитика', title: 'Результат и работа — рядом',
      text: 'Сделки и закупки с одной стороны, звонки, встречи, задачи и визиты — с другой. Для каждого менеджера, против команды.',
      points: ['Полосы — против лидера команды', 'Риска — медиана команды', 'Цвет — из чего состоит работа'],
      preview: <AnalyticsPreview /> },
    { id: 'signals', eyebrow: 'Слабые места', title: 'Видно, кому чего не хватает',
      text: 'Где менеджер заметно отличается от команды, появляется сигнал — с объяснением, что именно не так.',
      points: ['Мало встреч или активности', 'Активность не переходит в сделки', 'Сделки без зафиксированной работы'],
      preview: <SignalsPreview /> },
    { id: 'access', eyebrow: 'Доступ', title: 'Каждому — свои права',
      text: 'Пять встроенных ролей по нарастающей и свои роли из отдельных прав. Каждое изменение попадает в журнал.',
      points: ['Роль — на все пространства или на одно', 'Нельзя выдать больше прав, чем есть у себя', 'Журнал: кто, когда и что изменил'],
      preview: <AccessPreview /> },
  ]
}

const ease = [0.2, 0.7, 0.2, 1] as const

export function Welcome({ open, name, canTour, onTour, onSkip }: {
  open: boolean; name: string; canTour: boolean; onTour: () => void; onSkip: () => void
}) {
  const reduce = !!useReducedMotion()
  const deck = slides(name.split(/\s+/)[0] || name)
  const [[index, direction], setPage] = useState<[number, number]>([0, 1])
  const go = useCallback((next: number) => {
    setPage(([current]) => (next < 0 || next >= deck.length || next === current ? [current, 0] : [next, next > current ? 1 : -1]))
  }, [deck.length])
  const last = index === deck.length - 1
  const slide = deck[index]
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // Capture phase: Base UI's focus management sees keys on the popup before they would bubble to window.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, index, go])

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onSkip() }}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.3 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }} />}
              className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[6px]" />
            <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center p-3 sm:p-6">
              <Dialog.Popup
                initialFocus={primaryRef}
                render={<motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0, transition: dialogSpring }}
                  exit={{ opacity: 0, scale: 0.98, y: 6, transition: exitFast }} />}
                className="pointer-events-auto relative grid h-[min(640px,calc(100dvh-24px))] w-full max-w-[1080px] grid-rows-[200px_minmax(0,1fr)] overflow-hidden rounded-2xl bg-card text-card-foreground shadow-pop ring-1 ring-border outline-none sm:grid-rows-[250px_minmax(0,1fr)] lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:grid-rows-1">
                <Dialog.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 z-10 bg-card/80 backdrop-blur lg:top-4 lg:right-4" aria-label="Закрыть презентацию" />}><X /></Dialog.Close>

                {/* Story */}
                <div className="order-2 flex min-h-0 flex-col p-5 sm:p-8 lg:order-1 lg:p-10">
                  <div className="hidden items-center gap-2.5 lg:flex">
                    <BrandMark size={24} /><span className="text-[13px] font-semibold tracking-tight">CRM Analytics</span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-1 lg:py-6">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={slide.id}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease } }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                        <div className="text-[12px] font-medium text-primary tabular-nums">{String(index + 1).padStart(2, '0')} · {slide.eyebrow}</div>
                        <Dialog.Title className="mt-2 text-[24px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance sm:text-[30px]">{slide.title}</Dialog.Title>
                        <Dialog.Description className="mt-3 text-[14px] leading-relaxed text-pretty text-muted-foreground sm:text-[14.5px]">{slide.text}</Dialog.Description>
                        <ul className="mt-5 hidden gap-2.5 sm:grid">
                          {slide.points.map((point, at) => (
                            <motion.li key={point} className="flex items-start gap-2.5 text-[13.5px]"
                              initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.15 + at * 0.06, duration: 0.3, ease } }}>
                              <span className="mt-px grid size-[18px] flex-none place-items-center rounded-full bg-primary/12 text-primary"><Check className="size-3" strokeWidth={3} /></span>
                              {point}
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="grid gap-4 pt-3">
                    <div className="flex gap-1.5" role="group" aria-label="Слайды">
                      {deck.map((item, dot) => (
                        <button key={item.id} type="button" onClick={() => go(dot)} aria-label={`Слайд ${dot + 1}: ${item.eyebrow}`}
                          aria-current={dot === index ? 'step' : undefined} className="group h-4 flex-1 focus-visible:outline-none">
                          <span className="block h-1 overflow-hidden rounded-full bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
                            <motion.span className="block h-full rounded-full bg-primary" initial={false}
                              animate={{ width: dot <= index ? '100%' : '0%' }} transition={{ duration: 0.45, ease }} />
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {index > 0
                        ? <Button variant="outline" size="icon-lg" onClick={() => go(index - 1)} aria-label="Назад"><ArrowLeft /></Button>
                        : <Button variant="ghost" size="lg" onClick={onSkip}>Пропустить</Button>}
                      {!last && <Button ref={primaryRef} size="lg" onClick={() => go(index + 1)}>Далее<ArrowRight /></Button>}
                      {last && (
                        <div className="flex gap-2">
                          {canTour && <Button variant="ghost" size="lg" onClick={onSkip}>Позже</Button>}
                          <Button ref={primaryRef} size="lg" onClick={canTour ? onTour : onSkip}>{canTour ? 'Пройти тур' : 'Начать работу'}{canTour && <ArrowRight />}</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Product preview: the real components at product-shot scale, bleeding off the edge. */}
                <motion.div aria-hidden="true" className="relative order-1 min-h-0 touch-pan-y overflow-hidden border-b bg-canvas lg:order-2 lg:border-b-0 lg:border-l"
                  onPanEnd={(_, info) => { if (info.offset.x < -60) go(index + 1); else if (info.offset.x > 60) go(index - 1) }}>
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.div key={slide.id} custom={direction}
                      className="absolute top-6 left-5 w-[560px] origin-top-left scale-[0.6] sm:top-8 sm:left-8 sm:scale-[0.75] lg:top-1/2 lg:left-12 lg:origin-left lg:-translate-y-1/2 lg:scale-100"
                      variants={{
                        enter: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * 40 }),
                        center: { opacity: 1, x: 0, transition: { duration: 0.5, ease } },
                        exit: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * -40, transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }),
                      }}
                      initial="enter" animate="center" exit="exit">
                      {slide.preview}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </Dialog.Popup>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
