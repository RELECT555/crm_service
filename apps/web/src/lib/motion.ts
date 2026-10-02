import type { Transition, Variants } from 'motion/react'

// Motion presets for the whole UI (docs/ui-guidelines.md#motion). Springs feel physical without overshooting work UI;
// reduced motion is honored globally by <MotionConfig reducedMotion="user"> in main.tsx.

/** Menus and popovers: quick, slightly springy scale-in from the trigger. */
export const menuSpring: Transition = { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 }
/** Dialogs: settle without bounce. */
export const dialogSpring: Transition = { type: 'spring', bounce: 0, visualDuration: 0.28 }
/** Side sheets: slide with a calm spring. */
export const sheetSpring: Transition = { type: 'spring', bounce: 0, visualDuration: 0.36 }
/** Menus closing: a short ease-in so the popup is gone before the next click, without the abrupt feel of a cut. */
export const menuExit: Transition = { duration: 0.14, ease: [0.4, 0, 0.6, 1] }
/** Fast fade for exits so closing never feels sluggish. */
export const exitFast: Transition = { duration: 0.12, ease: [0.4, 0, 1, 1] }
/** Page content on route change. */
export const pageTransition: Transition = { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }

/** Parent of a list whose items appear one after another. */
export const staggerList: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
}
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
}
/** Menu items: a small horizontal settle, staggered by the popup. */
export const menuItem: Variants = {
  hidden: { opacity: 0, x: -4 },
  show: { opacity: 1, x: 0, transition: { duration: 0.16, ease: [0.2, 0.7, 0.2, 1] } },
}
