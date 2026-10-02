import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { type Toast, ToastContext } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const show = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = nextId.current++
    setToasts(current => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])
  const api = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="fixed right-5 bottom-5 z-[60] grid max-w-[calc(100vw-2rem)] gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={cn('max-w-sm min-w-64 animate-enter rounded-lg px-4 py-3 text-sm shadow-pop',
            toast.tone === 'error' ? 'bg-destructive text-white' : 'bg-foreground text-background')}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
