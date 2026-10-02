import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import type { Provider } from '@/lib/api'
import { ProviderMark } from '@/components/common'
import { Busy, SkeletonBlock, SkeletonText } from '@/components/skeletons'
import { PROVIDER_STATUS } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { cn } from '@/lib/utils'

/** Compact provider tiles: mark, name, one status line. Used in the connect sheet and for planned CRMs. */
export function ProviderGrid({ providers, selected, onSelect }: {
  providers: Provider[]; selected?: string | null; onSelect: (provider: Provider) => void
}) {
  return (
    <motion.div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5" variants={staggerList} initial="hidden" animate="show">
      {providers.map(provider => {
        const status = PROVIDER_STATUS[provider.status]
        return (
          <motion.button key={provider.id} type="button" onClick={() => onSelect(provider)} aria-pressed={selected === provider.id}
            variants={staggerItem} whileTap={{ scale: 0.99 }}
            className={cn('group flex items-center gap-3 rounded-xl bg-card p-3.5 text-left shadow-card ring-1 ring-border transition-[box-shadow] duration-200 outline-none hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/60',
              selected === provider.id && 'ring-2 ring-foreground/40')}>
            <span className={cn(provider.status === 'planned' && 'opacity-70 grayscale-[35%]')}><ProviderMark provider={provider.id} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{provider.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-1.5 flex-none rounded-full', status.dot)} />
                <span className="truncate">{status.label}</span>
              </span>
            </span>
            <ChevronRight className="size-4 flex-none text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5" />
          </motion.button>
        )
      })}
    </motion.div>
  )
}

/** Tiles of ProviderGrid with placeholders: same card, mark size and two line boxes. */
export function ProviderGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Busy className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-card p-3.5 shadow-card ring-1 ring-border">
          <SkeletonBlock className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1"><SkeletonText width={['55%', '40%', '65%', '50%'][index % 4]} /><SkeletonText className="mt-0.5 text-xs" width="70%" /></div>
          <SkeletonBlock className="size-4 rounded" />
        </div>
      ))}
    </Busy>
  )
}
