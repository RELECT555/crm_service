import { BarChart3 } from 'lucide-react'

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-8 flex-none place-items-center rounded-lg bg-primary text-primary-foreground shadow-card">
        <BarChart3 className="size-[17px]" />
      </span>
      {!compact && (
        <div className="min-w-0 animate-fade">
          <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">CRM Analytics</div>
          <div className="truncate text-xs text-muted-foreground">Администрирование</div>
        </div>
      )}
    </div>
  )
}
