import type { ReactNode } from 'react'
import type { Provider } from '@/lib/api'
import { CopyField } from '@/components/common'

/** Everything an operator needs to know before connecting a CRM; data comes from the backend catalog. */
export function ProviderDetails({ provider }: { provider: Provider }) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Коммерческие данные', value: <List items={provider.commercialData} /> },
    { label: 'Работа менеджеров', value: <List items={provider.workData} /> },
    { label: 'Права доступа', value: <Chips items={provider.scopes} /> },
    { label: 'Получение изменений', value: provider.changeCapture },
    { label: 'Ограничения API', value: provider.limits },
    { label: 'Встраивание в CRM', value: provider.embed },
    { label: 'Авторизация', value: provider.auth === 'oauth2' ? 'OAuth 2.0, только чтение' : 'API-ключ с правами только на чтение, хранится зашифрованным' },
    { label: 'Документация', value: <a href={provider.docsUrl} target="_blank" rel="noreferrer">Официальная документация ↗</a> },
  ]
  return (
    <div className="grid gap-5">
      <section>
        <h3 className="mb-3 text-[13px] font-semibold">Как подключить</h3>
        <ol className="grid gap-3">
          {provider.setupSteps.map((step, index) => (
            <li key={step} className="grid grid-cols-[26px_1fr] gap-3 text-muted-foreground">
              <span className="grid size-[26px] place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{index + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>
      {provider.callbackUrl && (
        <section className="grid gap-1.5">
          <span className="text-[13px] font-medium">Redirect URI для приложения в CRM</span>
          <CopyField value={provider.callbackUrl} label="Redirect URI" />
        </section>
      )}
      <div className="h-px bg-border" />
      <dl className="grid gap-x-4 gap-y-3 text-[13.5px] sm:grid-cols-[170px_1fr]">
        {rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mb-2 sm:mb-0">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return <ul className="grid list-disc gap-1 pl-4">{items.map(item => <li key={item}>{item}</li>)}</ul>
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => <span key={item} className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item}</span>)}
    </div>
  )
}
