import type { CSSProperties, ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, skeletonWidths } from '@/lib/utils'

// Skeleton primitives (docs/ui-guidelines.md#loading). A page skeleton is the page's own layout with placeholders
// instead of data: same cards, paddings and grids, real static labels, and text placeholders that occupy exactly one
// line box of the text they stand for. Then nothing jumps when the data arrives.

/** Marks a loading region for assistive technology; the shapes inside are decorative. */
export function Busy({ children, className, label = 'Загрузка' }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={className} aria-busy="true" role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  )
}

/**
 * One line of text. Pass the same text classes as the real text (`text-[13px]`, `text-2xl leading-tight`): the box is
 * `1lh` tall — that text's line height — and the bar is the height of its lowercase letters.
 */
export function SkeletonText({ className, width = '60%' }: { className?: string; width?: CSSProperties['width'] }) {
  return (
    <span aria-hidden="true" className={cn('flex h-[1lh] items-center', className)}>
      <span className="shimmer block h-[0.62em] rounded-[4px]" style={{ width }} />
    </span>
  )
}

/** A block with a fixed size — avatars, marks, bars, badges, buttons. Size and radius come from the real element. */
export function SkeletonBlock({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={cn('shimmer block flex-none rounded-md', className)} style={style} />
}

export type SkeletonColumn = { head: ReactNode; className?: string; cell?: (row: number) => ReactNode }

/** A real table — real column headings, real cell paddings — whose cells are placeholders. */
export function TableSkeleton({ columns, rows = 4 }: { columns: SkeletonColumn[]; rows?: number }) {
  const lengths = skeletonWidths(rows)
  return (
    <Table>
      <TableHeader>
        <TableRow>{columns.map((column, index) => <TableHead key={index} className={column.className}>{column.head}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, row) => (
          <TableRow key={row}>
            {columns.map((column, index) => (
              <TableCell key={index} className={column.className}>{column.cell ? column.cell(row) : <SkeletonText width={lengths[row]} />}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Avatar with a name line and a smaller second line, as in user and workspace rows. */
export function PersonSkeleton({ width = '50%', avatar = 'size-7 rounded-lg', first = 'text-[13px]', second = 'text-xs' }: {
  width?: string; avatar?: string; first?: string; second?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <SkeletonBlock className={avatar} />
      <div className="min-w-0 flex-1">
        <SkeletonText className={first} width={width} />
        <SkeletonText className={second} width="70%" />
      </div>
    </div>
  )
}

/** Fallback while a page chunk loads: the PageHeader shape and one list card. */
export function PageSkeleton() {
  return (
    <Busy>
      <header className="mb-7 border-b border-border pb-6">
        <div className="mb-3"><SkeletonText className="text-[13px]" width="9em" /></div>
        <div className="flex items-center gap-4">
          <SkeletonBlock className="size-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <SkeletonText className="text-[22px] leading-tight" width="12em" />
            <SkeletonText className="mt-1 text-[13.5px]" width="min(28em, 90%)" />
          </div>
        </div>
      </header>
      <div className="rounded-xl bg-card shadow-card ring-1 ring-border">
        {skeletonWidths(4, 30, 30).map(width => (
          <div key={width} className="border-b border-border/70 px-5 py-3 last:border-0"><PersonSkeleton width={width} /></div>
        ))}
      </div>
    </Busy>
  )
}
