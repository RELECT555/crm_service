import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { SessionProvider } from '@/components/SessionProvider'
import { ToastProvider } from '@/components/Toasts'
import { router } from '@/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": springs and slides turn into instant changes when the OS asks for less motion. */}
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        {/* Signed out → the sign-in screen; the router (and the onboarding inside its root route) mounts after sign-in. */}
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </ToastProvider>
    </MotionConfig>
  </StrictMode>,
)
