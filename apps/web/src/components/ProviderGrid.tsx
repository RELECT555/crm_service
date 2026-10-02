import type { Provider } from '@/lib/api'
import { ProviderMark, ToneBadge } from '@/components/common'
import { cn } from '@/lib/utils'

export function ProviderGrid({ providers, selected, onSelect }: {
  providers: Provider[]; selected?: string | null; onSelect: (provider: Provider) => void
}) {
  return (
    <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
      {providers.map(provider => (
        <button key={provider.id} type="button" onClick={() => onSelect(provider)} aria-pressed={selected === provider.id}
          className={cn('group flex flex-col gap-3 rounded-xl bg-card p-5 text-left shadow-card ring-1 ring-border transition-[box-shadow,translate] duration-200 ease-out outline-none hover:-translate-y-0.5 hover:shadow-pop hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50',
            selected === provider.id && 'ring-2 ring-primary')}>
          <div className="flex items-center gap-3">
            <ProviderMark provider={provider.id} />
            <div className="min-w-0">
              <div className="font-semibold">{provider.name}</div>
              <div className="text-[13px] text-muted-foreground">{provider.auth === 'oauth2' ? 'OAuth 2.0' : 'API-ключ'}</div>
            </div>
            <span className="ml-auto">
              {provider.status === 'available' ? <ToneBadge tone="ok">Доступно</ToneBadge> : <ToneBadge>Скоро</ToneBadge>}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">{provider.changeCapture}</p>
        </button>
      ))}
    </div>
  )
}
