import { ChevronDown } from 'lucide-react'
import type { Provider } from '@/lib/api'
import { CopyField } from '@/components/common'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'

/** Setup first, reference details folded away: the sheet should read in a few seconds. */
export function ProviderDetails({ provider }: { provider: Provider }) {
  const details: Array<[string, string]> = [
    ['Продажи и закупки', provider.commercialData.join('; ')],
    ['Работа менеджеров', provider.workData.join('; ')],
    ['Изменения', provider.changeCapture],
    ['Ограничения API', provider.limits],
    ['Встраивание', provider.embed],
  ]
  return (
    <div className="grid gap-6">
      <section>
        <h3 className="mb-3 text-[13px] font-medium text-muted-foreground">Как подключить</h3>
        <ol className="grid gap-2.5">
          {provider.setupSteps.map((step, index) => (
            <li key={step} className="flex gap-3 text-[13.5px] leading-relaxed">
              <span className="w-4 flex-none pt-px text-right text-[12px] font-medium text-muted-foreground tabular-nums">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
      {provider.callbackUrl && (
        <section className="grid gap-1.5">
          <h3 className="text-[13px] font-medium text-muted-foreground">Redirect URI</h3>
          <CopyField value={provider.callbackUrl} label="Redirect URI" />
        </section>
      )}
      <Collapsible className="border-t pt-4">
        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          Подробнее о данных и ограничениях
          <ChevronDown className="size-4 transition-transform duration-200 group-data-panel-open:rotate-180" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <dl className="grid gap-3 pt-4 text-[13px]">
            {details.map(([label, value]) => (
              <div key={label} className="grid gap-0.5 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div className="grid gap-0.5 sm:grid-cols-[150px_1fr] sm:gap-4">
              <dt className="text-muted-foreground">Документация</dt>
              <dd><a href={provider.docsUrl} target="_blank" rel="noreferrer">Открыть ↗</a></dd>
            </div>
          </dl>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  )
}
