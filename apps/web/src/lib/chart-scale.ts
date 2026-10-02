// Shared axis math for the hand-built charts (docs/ui-guidelines.md#charts).

/** Axis end and tick step: the step is 1, 2, 2.5 or 5 × 10ⁿ (never below 1 — counts are whole), 3–5 intervals. */
export function niceScale(value: number): { max: number; step: number } {
  const top = Math.max(value, 1)
  const power = 10 ** Math.floor(Math.log10(top / 4))
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(candidate => candidate * power >= top / 4) ?? 10) * power)
  return { max: Math.ceil(top / step) * step, step }
}
