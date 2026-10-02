import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"
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
              className={cn("pointer-events-auto relative flex w-full max-w-md flex-col rounded-xl bg-card text-card-foreground shadow-pop ring-1 ring-border outline-none", className)}
              {...props}
            >
              {children}
              <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Закрыть" />}>
                <X />
              </DialogPrimitive.Close>
            </DialogPrimitive.Popup>
          </div>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("grid gap-1 px-5 pt-5 pr-12", className)} {...props} />
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("px-5 py-4", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex justify-end gap-2 rounded-b-xl border-t bg-muted/50 px-5 py-3", className)} {...props} />
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-base font-semibold", className)} {...props} />
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription }
