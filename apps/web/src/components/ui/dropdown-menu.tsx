import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react"
import { Check } from "lucide-react"
import { menuExit, menuItem, menuSpring } from "@/lib/motion"
import { cn } from "@/lib/utils"

// Animated with Motion following motion.dev/docs/base-ui: open state is hoisted, the Portal is keepMounted inside
// AnimatePresence, and the popup and items render as motion elements so they can animate out.
// The popup unfolds from its trigger (scale + offset, spring) and retracts toward it on close; items settle one after
// another; the highlight is one pill
// that glides between items (shared layoutId per popup) instead of each row flashing its own background.

const MenuOpenContext = React.createContext(false)
const HighlightContext = React.createContext("menu")

function DropdownMenu({ open: controlledOpen, onOpenChange, ...props }: MenuPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  return (
    <MenuOpenContext.Provider value={open}>
      <MenuPrimitive.Root data-slot="dropdown-menu" open={open}
        onOpenChange={(next, details) => { setUncontrolledOpen(next); onOpenChange?.(next, details) }} {...props} />
    </MenuOpenContext.Provider>
  )
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({ className, side = "bottom", align = "start", sideOffset = 6, children, ...props }:
  MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  const open = React.useContext(MenuOpenContext)
  const highlight = React.useId()
  const lift = side === "top" ? 6 : side === "bottom" ? -6 : 0
  const slide = side === "left" ? 6 : side === "right" ? -6 : 0
  return (
    <AnimatePresence>
      {open && (
        <MenuPrimitive.Portal keepMounted>
          <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50 outline-none">
            <MenuPrimitive.Popup
              data-slot="dropdown-menu-content"
              render={
                <motion.div
                  variants={{
                    hidden: { opacity: 0, scale: 0.96, x: slide, y: lift },
                    show: { opacity: 1, scale: 1, x: 0, y: 0, pointerEvents: "auto",
                      transition: { ...menuSpring, staggerChildren: 0.022, delayChildren: 0.03 } },
                  }}
                  initial="hidden"
                  animate="show"
                  // Retract toward the trigger and stop taking the pointer at once, so a closing menu never
                  // re-highlights rows under the cursor. No blur: animating `filter` over the popup's backdrop-blur
                  // makes the glass flicker and smears the text.
                  exit={{ opacity: 0, scale: 0.97, x: slide / 2, y: lift / 2, pointerEvents: "none", transition: menuExit }}
                  style={{ transformOrigin: "var(--transform-origin)" }}
                />
              }
              className={cn(
                "max-h-(--available-height) min-w-56 overflow-y-auto rounded-xl bg-card/95 p-1.5 text-sm text-card-foreground shadow-pop ring-1 ring-border backdrop-blur-xl outline-none",
                className
              )}
              {...props}
            >
              <HighlightContext.Provider value={highlight}>{children}</HighlightContext.Provider>
            </MenuPrimitive.Popup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

const itemClass =
  "relative isolate flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg]:transition-colors data-highlighted:[&_svg]:text-foreground"

type ItemState = { highlighted: boolean }

/**
 * Renders an item as a motion element (inherits the popup's stagger) and, while highlighted, the shared pill behind it.
 * The pill sits at -z-10 inside the item's own stacking context (`isolate`), above the popup and below the label.
 */
function useAnimatedItem(tone: "default" | "destructive" = "default", as: "div" | "a" = "div") {
  const highlight = React.useContext(HighlightContext)
  const Element = as === "a" ? motion.a : motion.div
  return (props: React.HTMLAttributes<HTMLElement>, state: ItemState) => (
    <Element {...(props as HTMLMotionProps<"div"> & HTMLMotionProps<"a">)} variants={menuItem}>
      {state.highlighted && (
        <motion.span layoutId={highlight} aria-hidden="true"
          className={cn("absolute inset-0 -z-10 rounded-lg", tone === "destructive" ? "bg-destructive/10" : "bg-muted")}
          transition={{ type: "spring", stiffness: 700, damping: 45, mass: 0.6 }} />
      )}
      {props.children}
    </Element>
  )
}

function DropdownMenuItem({ className, variant = "default", ...props }: MenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      render={useAnimatedItem(variant)}
      className={cn(itemClass, variant === "destructive" && "text-destructive [&_svg]:text-destructive data-highlighted:[&_svg]:text-destructive", className)}
      {...props}
    />
  )
}

function DropdownMenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem data-slot="dropdown-menu-link-item" render={useAnimatedItem("default", "a")}
      className={cn(itemClass, "text-foreground no-underline hover:no-underline", className)} {...props} />
  )
}

function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" render={useAnimatedItem()} className={cn(itemClass, "pr-8", className)} {...props}>
      {children}
      <MenuPrimitive.RadioItemIndicator className="absolute right-2.5 flex items-center">
        <Check className="text-foreground!" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-label" className={cn("px-2.5 pt-2 pb-1 text-[11px] font-medium text-muted-foreground", className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
}

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator,
}
