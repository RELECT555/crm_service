import { cn } from '@/lib/utils'

/** Product mark: two bars for the two analytical axes (commercial outcomes and work). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-7 flex-none place-items-center rounded-[9px] bg-foreground text-background', className)} aria-hidden="true">
      <svg viewBox="0 0 20 20" className="size-4">
        <rect x="4" y="4.5" width="3.6" height="11" rx="1.8" fill="currentColor" />
        <rect x="12.4" y="8.5" width="3.6" height="7" rx="1.8" fill="currentColor" opacity="0.55" />
      </svg>
    </span>
  )
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      {!compact && <span className="truncate text-[14px] font-semibold tracking-tight text-foreground">CRM Analytics</span>}
    </div>
  )
}
