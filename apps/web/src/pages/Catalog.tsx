import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, Lock, Plug } from 'lucide-react'
import { api, type Provider } from '@/lib/api'
import { ErrorNotice, PageHeader, ProviderMark } from '@/components/common'
import { Busy, SkeletonBlock, SkeletonText } from '@/components/skeletons'
import { ProviderDetails, ProviderSheetHeader } from '@/components/ProviderDetails'
import { PROVIDER_STATUS } from '@/lib/format'
import { ProviderGrid, ProviderGridSkeleton } from '@/components/ProviderGrid'
import { Sheet, SheetBody, SheetContent } from '@/components/ui/sheet'
import { staggerItem, staggerList } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

export function Catalog() {
  const providers = useResource(() => api.providers(), [])
  const [selected, setSelected] = useState<Provider | null>(null)
  const list = providers.data ?? []
  const ready = list.filter(provider => provider.status !== 'planned')
  const planned = list.filter(provider => provider.status === 'planned')
  const count = (status: Provider['status']) => list.filter(provider => provider.status === status).length
  return (
    <>
      <PageHeader eyebrow="Интеграции" icon={Plug} title="Поддерживаемые CRM"
        subtitle="Что забираем из каждой системы и что нужно для подключения. Все интеграции работают только на чтение." />
      {providers.error && <ErrorNotice message={errorText(providers.error)} onRetry={providers.reload} />}
      {!providers.data && !providers.error && <CatalogSkeleton />}
      {providers.data && (
        <div className="grid gap-10">
          <div className="-mt-2 flex flex-wrap gap-2" aria-label="Сводка">
            {(['available', 'not_configured', 'planned'] as const).map(status => (
              <span key={status} className="inline-flex h-7 items-center gap-2 rounded-full bg-card px-3 text-xs shadow-card ring-1 ring-border">
                <span className={cn('size-1.5 rounded-full', PROVIDER_STATUS[status].dot)} />
                <span className="text-muted-foreground">{PROVIDER_STATUS[status].label}</span>
                <span className="font-semibold tabular-nums">{count(status)}</span>
              </span>
            ))}
          </div>

          <section className="grid gap-4" data-tour="catalog-ready">
            <div>
              <h2 className="text-[15px] font-semibold">Можно подключить</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Коннекторы реализованы. Подключение — из пространства клиента.</p>
            </div>
            <motion.div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" variants={staggerList} initial="hidden" animate="show">
              {ready.map(provider => <ProviderCard key={provider.id} provider={provider} onOpen={() => setSelected(provider)} />)}
            </motion.div>
          </section>

          {planned.length > 0 && (
            <section className="grid gap-4">
              <div>
                <h2 className="text-[15px] font-semibold">В разработке</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">API изучено и описано в документации; коннекторы ещё не реализованы.</p>
              </div>
              <ProviderGrid providers={planned} selected={selected?.id} onSelect={setSelected} />
            </section>
          )}
        </div>
      )}
      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <SheetContent>
          {selected && (
            <>
              <ProviderSheetHeader provider={selected} />
              <SheetBody><ProviderDetails provider={selected} /></SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

/** A connectable CRM: what it gives on both analytical axes, how it authorizes, and its state. */
function ProviderCard({ provider, onOpen }: { provider: Provider; onOpen: () => void }) {
  const status = PROVIDER_STATUS[provider.status]
  return (
    <motion.button type="button" onClick={onOpen} variants={staggerItem} whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group flex min-w-0 flex-col rounded-xl bg-card p-5 text-left shadow-card ring-1 ring-border transition-shadow outline-none hover:shadow-pop hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring/60">
      <div className="flex items-start gap-3.5">
        <ProviderMark provider={provider.id} large />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-tight">{provider.name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', status.dot)} />{status.label}
          </div>
        </div>
        <ArrowUpRight className="size-4 flex-none text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
      </div>
      <dl className="mt-5 grid gap-2 text-[13px]">
        <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">Результат</dt><dd className="truncate" title={provider.commercialData.join('; ')}>{provider.commercialData[0]}</dd>
        </div>
        <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">Работа</dt><dd className="truncate" title={provider.workData.join('; ')}>{provider.workData[0]}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t pt-4 text-xs text-muted-foreground">
        <span className="inline-flex h-6 items-center rounded-md bg-muted px-2">{provider.auth === 'oauth2' ? 'OAuth 2.0' : 'API-ключ'}</span>
        <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2"><Lock className="size-3" />Только чтение</span>
        {provider.status === 'not_configured' && <span className="ml-auto text-warning">нужны ключи</span>}
      </div>
    </motion.button>
  )
}

/** The catalog's layout with placeholders: summary chips, connectable cards, planned tiles. */
function CatalogSkeleton() {
  return (
    <Busy className="grid gap-10">
      <div className="-mt-2 flex flex-wrap gap-2">{['11rem', '13rem', '8.5rem'].map(width => <SkeletonBlock key={width} className="h-7 rounded-full" style={{ width }} />)}</div>
      <section className="grid gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">Можно подключить</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Коннекторы реализованы. Подключение — из пространства клиента.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {['45%', '50%', '38%'].map(width => (
            <div key={width} className="flex flex-col rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
              <div className="flex items-start gap-3.5">
                <SkeletonBlock className="size-11 rounded-lg" />
                <div className="min-w-0 flex-1"><SkeletonText className="text-[15px] font-semibold" width={width} /><SkeletonText className="mt-1 text-xs" width="65%" /></div>
              </div>
              <div className="mt-5 grid gap-2 text-[13px]">
                {['Результат', 'Работа'].map(label => (
                  <div key={label} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">{label}</span><SkeletonText width="90%" /></div>
                ))}
              </div>
              <div className="mt-5 flex gap-1.5 border-t pt-4"><SkeletonBlock className="h-6 w-[4.5rem]" /><SkeletonBlock className="h-6 w-28" /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">В разработке</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">API изучено и описано в документации; коннекторы ещё не реализованы.</p>
        </div>
        <ProviderGridSkeleton />
      </section>
    </Busy>
  )
}
