const vertexSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// A pair of flowing silk bands echoes the two bars in the product mark.
// Color uniforms are read from the theme tokens, never from a second palette.
const fragmentSource = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_phase;
uniform vec3 u_background;
uniform vec3 u_primary;
uniform vec3 u_accent;
uniform float u_strength;

float band(float distance, float width) {
  return exp(-distance * distance / width);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_phase * 6.283185;
  float bend = 0.12 * sin(p.x * 3.2 + sin(t))
    + 0.05 * sin(p.x * 6.0 - cos(t));
  float flow = p.y + p.x * 0.42 + bend;
  float upper = flow - 0.46 - 0.045 * sin(t);
  float lower = flow + 0.46 + 0.045 * cos(t);
  float haze = band(upper, 0.13) + band(lower, 0.13);
  float silk = band(upper, 0.012) + band(lower, 0.018);
  float folds = pow(0.5 + 0.5 * sin(flow * 95.0 + p.x * 5.0), 12.0);
  float detail = folds * (band(upper, 0.035) + band(lower, 0.035));
  float center = 1.0 - 0.72 * exp(-dot(p * vec2(1.3, 1.8), p * vec2(1.3, 1.8)) * 3.0);
  vec3 color = mix(u_background, u_accent, clamp(haze * 0.7, 0.0, 1.0));
  color = mix(color, u_primary, clamp((silk * 0.55 + detail * 0.12) * center * u_strength, 0.0, 0.7));
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(color + grain * 0.009, 1.0);
}
`

export type LoginShader = {
  draw: (phase: number) => void
  resize: () => void
  dispose: () => void
}

/** Null means WebGL is unavailable; the token-based CSS background remains visible. */
export function createLoginShader(canvas: HTMLCanvasElement, dark: boolean): LoginShader | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
  if (!gl) return null

  const shaders: WebGLShader[] = []
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  const dispose = () => {
    for (const shader of shaders) gl.deleteShader(shader)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }

  try {
    if (!program || !buffer) throw new Error('Unable to allocate WebGL resources')
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Unable to allocate WebGL shader')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Unable to compile WebGL shader')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Unable to link WebGL shader')
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const styles = getComputedStyle(document.documentElement)
    for (const token of ['background', 'primary', 'accent']) {
      // These theme tokens are six-digit hex values in index.css.
      const hex = styles.getPropertyValue(`--${token}`).trim()
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      gl.uniform3f(gl.getUniformLocation(program, `u_${token}`), rgb[0], rgb[1], rgb[2])
    }
    gl.uniform1f(gl.getUniformLocation(program, 'u_strength'), dark ? 0.55 : 0.85)
    const resolution = gl.getUniformLocation(program, 'u_resolution')
    const phaseUniform = gl.getUniformLocation(program, 'u_phase')

    return {
      resize() {
        const { width, height } = canvas.getBoundingClientRect()
        // Cap both pixel density and total work on wide screens and mobile GPUs.
        const scale = Math.min(window.devicePixelRatio || 1, 1.25, 1600 / Math.max(width, height, 1))
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.uniform2f(resolution, canvas.width, canvas.height)
      },
      draw(phase) {
        gl.uniform1f(phaseUniform, phase)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      },
      dispose,
    }
  } catch (error) {
    dispose()
    // Decoration must not prevent sign-in; report failures and use the static CSS fallback.
    console.warn('Login background uses the static fallback:', error)
    return null
  }
}
