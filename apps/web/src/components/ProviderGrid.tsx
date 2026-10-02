import { ChevronRight } from 'lucide-react'
import type { Provider } from '@/lib/api'
import { ProviderMark } from '@/components/common'
import { cn } from '@/lib/utils'

const STATUS: Record<Provider['status'], { label: string; dot: string }> = {
  available: { label: 'Готово к подключению', dot: 'bg-success' },
  not_configured: { label: 'Нужны ключи приложения', dot: 'bg-warning' },
  planned: { label: 'В разработке', dot: 'bg-muted-foreground/40' },
}

/** Calm provider tiles: mark, name, one status line. Details live in the sheet. */
export function ProviderGrid({ providers, selected, onSelect }: {
  providers: Provider[]; selected?: string | null; onSelect: (provider: Provider) => void
}) {
  return (
    <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {providers.map(provider => {
        const status = STATUS[provider.status]
        return (
          <button key={provider.id} type="button" onClick={() => onSelect(provider)} aria-pressed={selected === provider.id}
            className={cn('group flex items-center gap-3 rounded-xl bg-card p-4 text-left shadow-card ring-1 ring-border transition-[box-shadow] duration-200 outline-none hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/60',
              selected === provider.id && 'ring-2 ring-foreground/40',
              provider.status === 'planned' && 'opacity-80')}>
            <ProviderMark provider={provider.id} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{provider.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-1.5 flex-none rounded-full', status.dot)} />
                <span className="truncate">{status.label}</span>
              </span>
            </span>
            <ChevronRight className="size-4 flex-none text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        )
      })}
    </div>
  )
}
