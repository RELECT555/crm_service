import { useEffect, useRef } from 'react'
import { createLoginShader, type LoginShader } from '@/lib/login-shader'
import { useTheme } from '@/lib/theme'

/** One full drift cycle of the shader phase. */
const LOOP_SECONDS = 18

/** Decorative only: no pointer events, tab stops, or React updates on animation frames. */
export function LoginBackdrop({ animated }: { animated: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(0)
  const { resolved } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let shader: LoginShader | null = null
    // A plain rAF loop, not Motion's animate(): Motion skips animations under OS reduced motion,
    // while this backdrop is meant to move unless the user pauses it on the page.
    let frame = 0
    let lastTick = 0
    let lastDraw = 0
    let phase = phaseRef.current

    const resize = () => {
      shader?.resize()
      shader?.draw(phase)
    }
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (lastTick) phase = (phase + (now - lastTick) / 1000 / LOOP_SECONDS) % 1
      lastTick = now
      phaseRef.current = phase
      if (now - lastDraw < 1000 / 30) return
      lastDraw = now
      shader?.draw(phase)
    }
    const stopLoop = () => {
      cancelAnimationFrame(frame)
      frame = 0
      lastTick = 0
    }
    const syncPlayback = () => {
      // Browsers already throttle rAF in hidden tabs; stopping avoids a phase jump on return.
      if (!shader || !animated || document.hidden) stopLoop()
      else if (!frame) frame = requestAnimationFrame(tick)
    }
    const start = () => {
      shader = createLoginShader(canvas, resolved === 'dark')
      canvas.style.opacity = shader ? '1' : '0'
      if (!shader) return
      resize()
      syncPlayback()
    }
    const lost = (event: Event) => {
      event.preventDefault()
      stopLoop()
      shader?.dispose()
      shader = null
      canvas.style.opacity = '0'
    }
    const restored = () => start()

    start()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    document.addEventListener('visibilitychange', syncPlayback)
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => {
      stopLoop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', syncPlayback)
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      shader?.dispose()
    }
  }, [resolved, animated])

  return (
    <div aria-hidden="true" className="login-backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-0" />
    </div>
  )
}
