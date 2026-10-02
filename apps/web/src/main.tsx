import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from '@/App'
import { SessionProvider } from '@/components/SessionProvider'
import { ToastProvider } from '@/components/Toasts'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": springs and slides turn into instant changes when the OS asks for less motion. */}
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </MotionConfig>
  </StrictMode>,
)
