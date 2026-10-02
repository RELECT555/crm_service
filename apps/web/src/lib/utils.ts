import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Skeleton widths that look like real, varied content (stable across renders). */
export const skeletonWidths = (count: number, from = 55, spread = 35) =>
  Array.from({ length: count }, (_, index) => `${from + ((index * 37) % spread)}%`)
