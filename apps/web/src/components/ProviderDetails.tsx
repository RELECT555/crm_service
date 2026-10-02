import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, Briefcase, ChevronDown, Gauge, KeyRound, ListChecks, PanelsTopLeft, RefreshCw } from 'lucide-react'
import type { Provider } from '@/lib/api'
import { CopyField, ProviderMark, Steps } from '@/components/common'
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { staggerItem, staggerList } from '@/lib/motion'
import { PROVIDER_STATUS } from '@/lib/format'
import { cn } from '@/lib/utils'

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <motion.section variants={staggerItem} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </motion.section>
  )
}

/** Provider reference: setup steps, the redirect URI, what is read, and technical limits (folded). */
export function ProviderDetails({ provider }: { provider: Provider }) {
  const data: Array<{ icon: typeof Briefcase; title: string; items: string[] }> = [
    { icon: Briefcase, title: 'Продажи и закупки', items: provider.commercialData },
    { icon: ListChecks, title: 'Работа менеджеров', items: provider.workData },
  ]
  const technical: Array<{ icon: typeof Gauge; label: string; value: string }> = [
    { icon: RefreshCw, label: 'Изменения', value: provider.changeCapture },
    { icon: Gauge, label: 'Ограничения API', value: provider.limits },
    { icon: PanelsTopLeft, label: 'Встраивание', value: provider.embed },
    ...(provider.scopes.length ? [{ icon: KeyRound, label: 'Доступы', value: provider.scopes.join(', ') }] : []),
  ]
  return (
    <motion.div className="grid gap-7" variants={staggerList} initial="hidden" animate="show">
      <Section title="Как подключить">
        <Steps items={provider.setupSteps} />
      </Section>

      {provider.callbackUrl && (
        <Section title="Redirect URI">
          <div className="grid gap-2 rounded-xl bg-muted/40 p-3.5 ring-1 ring-border">
            <CopyField value={provider.callbackUrl} label="Redirect URI" />
            <p className="px-0.5 text-xs text-muted-foreground">Укажите этот адрес в настройках приложения CRM — туда CRM вернёт пользователя после входа.</p>
          </div>
        </Section>
      )}

      <Section title="Что забираем">
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map(block => (
            <div key={block.title} className="rounded-xl bg-card p-4 shadow-card ring-1 ring-border">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground"><block.icon className="size-3.5" /></span>
                <span className="text-[13px] font-medium">{block.title}</span>
              </div>
              <ul className="mt-3 grid gap-1.5 text-[13px] leading-snug text-muted-foreground">
                {block.items.map(item => (
                  <li key={item} className="flex gap-2"><span aria-hidden="true" className="mt-[7px] size-1 flex-none rounded-full bg-muted-foreground/50" />{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <motion.div variants={staggerItem}>
        <Collapsible className="rounded-xl ring-1 ring-border">
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl px-4 py-3 text-[13px] font-semibold outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50">
            Технические детали
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <dl className="grid gap-3.5 border-t px-4 py-4 text-[13px]">
              {technical.map(row => (
                <div key={row.label} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5 sm:grid-cols-[20px_140px_minmax(0,1fr)]">
                  <row.icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="col-start-2 sm:col-start-3">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CollapsiblePanel>
        </Collapsible>
      </motion.div>

      <motion.a variants={staggerItem} href={provider.docsUrl} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 justify-self-start text-[13px] font-medium">
        Документация API {provider.name}<ArrowUpRight className="size-3.5" />
      </motion.a>
    </motion.div>
  )
}

/** Sheet header for a provider: large mark, name, and its status as a dot with text. */
export function ProviderSheetHeader({ provider, subtitle }: { provider: Provider; subtitle?: string }) {
  const status = PROVIDER_STATUS[provider.status]
  return (
    <SheetHeader className="flex items-center gap-4">
      <ProviderMark provider={provider.id} large />
      <div className="grid min-w-0 gap-1">
        <SheetTitle className="text-[17px] tracking-tight">{provider.name}</SheetTitle>
        <SheetDescription className="flex items-center gap-1.5 text-[13px]">
          <span className={cn('size-1.5 flex-none rounded-full', status.dot)} />{subtitle ?? status.text}
        </SheetDescription>
      </div>
    </SheetHeader>
  )
}
