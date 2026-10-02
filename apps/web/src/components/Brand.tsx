import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ inverted }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 flex-none place-items-center rounded-lg bg-primary text-primary-foreground"><BarChart3 className="size-[17px]" /></span>
      <div>
        <div className={cn('text-[15px] font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>CRM Analytics</div>
        <div className={cn('text-xs', inverted ? 'text-sidebar-muted' : 'text-muted-foreground')}>Администрирование</div>
      </div>
    </div>
  )
}
