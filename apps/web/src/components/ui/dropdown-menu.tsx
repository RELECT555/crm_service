import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { AnimatePresence, motion } from "motion/react"
import { Check } from "lucide-react"
import { exitFast, menuItem, menuSpring } from "@/lib/motion"
import { cn } from "@/lib/utils"

// Animated with Motion following motion.dev/docs/base-ui: open state is hoisted, the Portal is keepMounted inside
// AnimatePresence, and the popup and items render as motion elements so they can animate out.

const MenuOpenContext = React.createContext(false)

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
                    hidden: { opacity: 0, scale: 0.94, y: side === "top" ? 4 : -4 },
                    show: { opacity: 1, scale: 1, y: 0, transition: { ...menuSpring, staggerChildren: 0.025, delayChildren: 0.03 } },
                  }}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, scale: 0.97, transition: exitFast }}
                  style={{ transformOrigin: "var(--transform-origin)" }}
                />
              }
              className={cn(
                "max-h-(--available-height) min-w-52 overflow-y-auto rounded-xl bg-card p-1 text-sm text-card-foreground shadow-pop ring-1 ring-border outline-none",
                className
              )}
              {...props}
            >
              {children}
            </MenuPrimitive.Popup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

const itemClass =
  "relative flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none select-none transition-colors duration-100 data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"

/** Items inherit the popup's variant state, so the popup's staggerChildren orders them. */
const animatedItem = <motion.div variants={menuItem} />

function DropdownMenuItem({ className, variant = "default", ...props }: MenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      render={animatedItem}
      className={cn(itemClass, variant === "destructive" && "text-destructive data-highlighted:bg-destructive/10 [&_svg]:text-destructive", className)}
      {...props}
    />
  )
}

function DropdownMenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem data-slot="dropdown-menu-link-item" render={<motion.a variants={menuItem} />}
      className={cn(itemClass, "text-foreground no-underline hover:no-underline", className)} {...props} />
  )
}

function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" render={animatedItem} className={cn(itemClass, "pr-8", className)} {...props}>
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
