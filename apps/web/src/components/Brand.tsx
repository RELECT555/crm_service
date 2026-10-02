import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Product mark (docs/ui-guidelines.md#brand). Two bars are the two analytical axes — result and work; the violet dot
 * marks the gap the shorter bar has to close: the product's job is to show what is missing. The tile is graphite in
 * the light theme and inverts in the dark one; the dot is always the primary color.
 */
export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  const gloss = useId()
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true"
      className={cn('flex-none text-foreground drop-shadow-[0_1px_1px_rgb(0_0_0/0.12)]', className)}>
      <defs>
        <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <rect width="32" height="32" rx="9" fill={`url(#${gloss})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity="0.08" />
      <rect x="8.5" y="9" width="5" height="14.5" rx="2.5" className="fill-background" />
      <rect x="18.5" y="15" width="5" height="8.5" rx="2.5" className="fill-background" opacity="0.62" />
      <circle cx="21" cy="10.25" r="2.6" className="fill-primary" />
    </svg>
  )
}

export function Brand({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark />
      {!compact && (
        <span className="grid min-w-0 leading-none">
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">CRM Analytics</span>
          <span className="mt-1 truncate text-[11px] font-medium text-muted-foreground">Аналитика команды продаж</span>
        </span>
      )}
    </div>
  )
}
