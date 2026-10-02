import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Lock } from 'lucide-react'
import { ProviderMark } from '@/components/common'
import { SERIES } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'

// Illustrations for the welcome presentation. They are drawn from the same marks as the real screens (meters with a
// median tick, composition bars, provider marks), so the presentation never promises a UI that does not exist.
// Everything starts when the slide mounts; under reduced motion the end state is shown at once.

const ease = [0.16, 1, 0.3, 1] as const
const panel = 'rounded-3xl bg-foreground/[0.04] ring-1 ring-foreground/10 backdrop-blur-sm'

/** Grows from 0 to `to` (a fraction) along x, starting from the left edge. */
function Grow({ to, delay = 0, className, style }: { to: number; delay?: number; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion()
  return (
    <motion.div className={cn('h-full origin-left rounded-full', className)} style={{ width: `${to * 100}%`, ...style }}
      initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.1, delay, ease }} />
  )
}

/** Slide 1: the product mark, its two bars rising — result and work. */
export function HeroVisual() {
  const reduce = useReducedMotion()
  const bar = (height: number, delay: number, opacity: number) => (
    <motion.span className="w-[22%] origin-bottom rounded-full bg-stage" style={{ height: `${height}%`, opacity }}
      initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay }} />
  )
  return (
    <motion.div className="mx-auto grid size-28 place-items-center rounded-[30px] bg-foreground shadow-[0_30px_80px_-20px_color-mix(in_oklch,var(--foreground)_25%,transparent)] sm:size-36 sm:rounded-[38px]"
      initial={reduce ? false : { opacity: 0, scale: 0.7, filter: 'blur(12px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1, ease }}>
      <span className="flex h-[52%] w-[52%] items-end justify-center gap-[16%]" aria-hidden="true">
        {bar(100, 0.45, 1)}
        {bar(64, 0.6, 0.55)}
      </span>
    </motion.div>
  )
}

const WORK = [
  { label: 'Звонки', share: 0.34 }, { label: 'Встречи', share: 0.16 }, { label: 'Задачи', share: 0.24 },
  { label: 'Письма', share: 0.16 }, { label: 'Визиты', share: 0.1 },
]

/** Slide 2: the two axes side by side — commercial result and the work behind it. */
export function AxesVisual() {
  const reduce = useReducedMotion()
  return (
    <div className={cn(panel, 'mx-auto grid w-full max-w-xl gap-6 p-5 text-left sm:p-7')}>
      <div className="grid gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-foreground">Результат</span>
          <span className="text-xs text-foreground/50">сделки и закупки</span>
        </div>
        <div className="h-3 rounded-full bg-foreground/[0.06]"><Grow to={0.62} delay={0.5} className="bg-foreground" /></div>
      </div>
      <div className="grid gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-foreground">Работа</span>
          <span className="text-xs text-foreground/50">звонки, встречи, задачи, письма, визиты</span>
        </div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-foreground/[0.06]">
          {WORK.map((part, index) => (
            <motion.span key={part.label} className="h-full origin-left first:rounded-l-full last:rounded-r-full"
              style={{ width: `${part.share * 88}%`, background: SERIES[index] }}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 + index * 0.12, ease }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          {WORK.map((part, index) => (
            <span key={part.label} className="flex items-center gap-1.5 text-xs text-foreground/60">
              <span className="size-2 rounded-full" style={{ background: SERIES[index] }} />{part.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const PROVIDERS = [
  { id: 'bitrix24', name: 'Bitrix24', ready: true }, { id: 'kommo', name: 'Kommo', ready: true },
  { id: 'amocrm', name: 'amoCRM', ready: true }, { id: 'hubspot', name: 'HubSpot', ready: false },
  { id: 'pipedrive', name: 'Pipedrive', ready: false }, { id: 'salesforce', name: 'Salesforce', ready: false },
]

/** Slide 3: the connector catalog — three ready, more on the way — and the read-only promise. */
export function ConnectVisual() {
  const reduce = useReducedMotion()
  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {PROVIDERS.map((provider, index) => (
          <motion.div key={provider.id} className={cn(panel, 'grid justify-items-center gap-2 px-2 py-3 sm:gap-2.5 sm:py-5', !provider.ready && 'opacity-45')}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: provider.ready ? 1 : 0.45, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 170, damping: 20, delay: 0.35 + index * 0.08 }}>
            <ProviderMark provider={provider.id} large />
            <span className="text-[13px] font-medium text-foreground">{provider.name}</span>
            <span className="text-[11px] text-foreground/45">{provider.ready ? 'в каталоге' : 'скоро'}</span>
          </motion.div>
        ))}
      </div>
      <motion.div className="mx-auto flex items-center gap-2 rounded-full bg-foreground/[0.06] px-4 py-2 text-[13px] text-foreground/80 ring-1 ring-foreground/10"
        initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 1.1, ease }}>
        <Lock className="size-3.5" aria-hidden="true" />Только чтение — в вашей CRM ничего не меняется
      </motion.div>
    </div>
  )
}

const PEOPLE = [
  { initials: 'АС', value: 0.86 }, { initials: 'БК', value: 0.3, weak: true }, { initials: 'ВЛ', value: 0.72 }, { initials: 'ГО', value: 0.58 },
]
const MEDIAN = 0.65

/** Slide 4: managers against the team median; one falls behind and gets an explained signal. */
export function SignalsVisual() {
  const reduce = useReducedMotion()
  return (
    <div className={cn(panel, 'mx-auto grid w-full max-w-xl gap-3 p-5 text-left sm:p-7')}>
      <div className="flex justify-between text-xs text-foreground/50"><span>Встречи на менеджера</span><span>риска — медиана команды</span></div>
      <div className="relative grid gap-2">
        {PEOPLE.map((person, index) => (
          <div key={person.initials} className="relative flex items-center gap-3 rounded-xl px-2 py-2">
            {person.weak && (
              <motion.span className="absolute inset-0 rounded-xl bg-warning/15" aria-hidden="true"
                initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2, duration: 0.5 }} />
            )}
            <span className="relative grid size-8 flex-none place-items-center rounded-full bg-foreground/10 text-[11px] font-semibold text-foreground">{person.initials}</span>
            <div className="relative h-2.5 flex-1 rounded-full bg-foreground/[0.07]">
              <Grow to={person.value} delay={0.4 + index * 0.12} className={person.weak ? 'bg-warning' : 'bg-foreground/85'} />
              <motion.span className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-foreground/70" style={{ left: `${MEDIAN * 100}%` }}
                initial={reduce ? false : { opacity: 0, scaleY: 0 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ delay: 1.3, duration: 0.4 }} />
            </div>
          </div>
        ))}
      </div>
      <motion.div className="flex items-start gap-2.5 rounded-xl bg-foreground/[0.05] px-3.5 py-3 text-[13px] ring-1 ring-foreground/10"
        initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ delay: 2.2, duration: 0.6, ease }}>
        <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" aria-hidden="true" />
        <span className="text-foreground/80"><span className="font-medium text-foreground">БК · Мало встреч.</span> 3 встречи при медиане команды 7.</span>
      </motion.div>
    </div>
  )
}

const ROLES = ['Наблюдатель', 'Аналитик', 'Интегратор', 'Администратор', 'Владелец']

/** Slide 5: built-in roles as a staircase — each includes the previous one. Phones get the same ladder lying on its side. */
export function RolesVisual() {
  const reduce = useReducedMotion()
  return (
    <>
      <div className="mx-auto grid w-full max-w-sm gap-2.5 sm:hidden">
        {ROLES.map((role, index) => (
          <div key={role} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 text-left">
            <span className="text-[13px] text-foreground/70">{role}</span>
            <div className="h-7 overflow-hidden rounded-lg bg-foreground/[0.04]">
              <motion.div className="relative h-full origin-left rounded-lg bg-foreground/[0.08] ring-1 ring-foreground/10"
                style={{ width: `${28 + index * 18}%` }}
                initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.35 + index * 0.1 }}>
                <span className="absolute inset-y-0 right-0 w-1.5 bg-primary" style={{ opacity: 0.45 + index * 0.13 }} />
              </motion.div>
            </div>
          </div>
        ))}
      </div>
      <RolesStairs reduce={!!reduce} />
    </>
  )
}

function RolesStairs({ reduce }: { reduce: boolean }) {
  return (
    <div className="mx-auto hidden w-full max-w-xl grid-cols-5 items-end gap-3 sm:grid">
      {ROLES.map((role, index) => (
        <div key={role} className="grid gap-2.5">
          <div className="flex h-40 items-end sm:h-48">
            <motion.div className="relative w-full origin-bottom overflow-hidden rounded-2xl bg-foreground/[0.06] ring-1 ring-foreground/10"
              style={{ height: `${28 + index * 18}%` }}
              initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
              transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.35 + index * 0.12 }}>
              <span className="absolute inset-x-0 top-0 h-1.5 bg-primary" style={{ opacity: 0.45 + index * 0.13 }} />
            </motion.div>
          </div>
          <span className="text-center text-xs leading-tight text-foreground/60">{role}</span>
        </div>
      ))}
    </div>
  )
}
