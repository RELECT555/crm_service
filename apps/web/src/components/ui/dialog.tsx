import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { AnimatePresence, motion } from "motion/react"
import { X, type LucideIcon } from "lucide-react"
import { dialogSpring, exitFast } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Animated with Motion (motion.dev/docs/base-ui): the open state is read from context so the keepMounted Portal can
// stay mounted inside AnimatePresence until the exit animation finishes.

const DialogOpenContext = React.createContext(false)

function Dialog({ open = false, ...props }: DialogPrimitive.Root.Props) {
  return (
    <DialogOpenContext.Provider value={open}>
      <DialogPrimitive.Root data-slot="dialog" open={open} {...props} />
    </DialogOpenContext.Provider>
  )
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  const open = React.useContext(DialogOpenContext)
  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal keepMounted>
          <DialogPrimitive.Backdrop render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exitFast }} />}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
            <DialogPrimitive.Popup
              data-slot="dialog-content"
              render={<motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0, transition: dialogSpring }}
                exit={{ opacity: 0, scale: 0.98, y: 4, transition: exitFast }} />}
              className={cn("pointer-events-auto relative flex max-h-[calc(100svh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-card text-card-foreground shadow-pop ring-1 ring-border outline-none", className)}
              {...props}
            >
              {children}
              <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4 rounded-full text-muted-foreground hover:text-foreground" aria-label="Закрыть" />}>
                <X />
              </DialogPrimitive.Close>
            </DialogPrimitive.Popup>
          </div>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

/**
 * Header: optional icon tile, then title and description. `tone="destructive"` marks irreversible or
 * access-removing actions; everything else uses the accent tile.
 */
function DialogHeader({ className, icon: Icon, tone = "default", children, ...props }: React.ComponentProps<"div"> & {
  icon?: LucideIcon; tone?: "default" | "destructive"
}) {
  return (
    <div data-slot="dialog-header" className={cn("flex items-start gap-4 border-b border-border px-6 pt-6 pb-5 pr-14 last:border-b-0", className)} {...props}>
      {Icon && (
        <span className={cn("grid size-10 flex-none place-items-center rounded-xl ring-1",
          tone === "destructive" ? "bg-destructive/10 text-destructive ring-destructive/15" : "bg-accent text-primary ring-primary/15")}>
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="grid min-w-0 gap-1 pt-0.5">{children}</div>
    </div>
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("grid gap-4 px-6 py-5", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto [[data-slot=dialog-header]+&]:border-t-0", className)} {...props} />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-[17px] leading-snug font-semibold tracking-tight", className)} {...props} />
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-[13.5px] leading-relaxed text-muted-foreground", className)} {...props} />
}

export { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription }
