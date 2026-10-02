import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { type Toast, ToastContext } from '../toast.ts'

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
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(toast => <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'error' : ''}`}>{toast.message}</div>)}
      </div>
    </ToastContext.Provider>
  )
}
