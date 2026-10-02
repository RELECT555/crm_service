import { useEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { createLoginShader, type LoginShader } from '@/lib/login-shader'
import { loginShaderDrift } from '@/lib/motion'
import { useTheme } from '@/lib/theme'

/** Decorative only: no pointer events, tab stops, or React updates on animation frames. */
export function LoginBackdrop({ animated }: { animated: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(0)
  const { resolved } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let shader: LoginShader | null = null
    let playback: ReturnType<typeof animate> | undefined
    let lastDraw = 0
    const initialPhase = phaseRef.current
    let phase = initialPhase

    const resize = () => {
      shader?.resize()
      shader?.draw(phase)
    }
    const syncPlayback = () => {
      if (!shader || !playback) return
      if (document.hidden) playback.pause()
      else playback.play()
    }
    const start = () => {
      shader = createLoginShader(canvas, resolved === 'dark')
      canvas.style.opacity = shader ? '1' : '0'
      if (!shader) return
      resize()
      if (!animated) return
      playback = animate(0, 1, {
        ...loginShaderDrift,
        onUpdate(value) {
          // Motion can still emit the held value while paused; do not submit GPU work.
          if (document.hidden) return
          phase = (initialPhase + value) % 1
          phaseRef.current = phase
          const now = performance.now()
          if (now - lastDraw < 1000 / 30) return
          lastDraw = now
          shader?.draw(phase)
        },
      })
      syncPlayback()
    }
    const lost = (event: Event) => {
      event.preventDefault()
      playback?.stop()
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
      playback?.stop()
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
