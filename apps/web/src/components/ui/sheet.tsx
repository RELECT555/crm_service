import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"
import { exitFast, sheetSpring } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** Side panel built on the Base UI dialog (focus trap, Escape, scroll lock), animated with Motion like Dialog. */
const SheetOpenContext = React.createContext(false)

function Sheet({ open = false, ...props }: SheetPrimitive.Root.Props) {
  return (
    <SheetOpenContext.Provider value={open}>
      <SheetPrimitive.Root data-slot="sheet" open={open} {...props} />
    </SheetOpenContext.Provider>
  )
}

function SheetContent({ className, children, side = "right", ...props }: SheetPrimitive.Popup.Props & { side?: "left" | "right" }) {
  const open = React.useContext(SheetOpenContext)
  const offset = side === "right" ? 48 : -48
  return (
    <AnimatePresence>
      {open && (
        <SheetPrimitive.Portal keepMounted>
          <SheetPrimitive.Backdrop render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.18 } }} />}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
          <SheetPrimitive.Popup
            data-slot="sheet-content"
            render={<motion.div initial={{ x: offset, opacity: 0 }} animate={{ x: 0, opacity: 1, transition: sheetSpring }}
              exit={{ x: offset / 2, opacity: 0, transition: exitFast }} />}
            className={cn("fixed inset-y-0 z-50 flex h-full w-full flex-col bg-card text-card-foreground shadow-pop ring-1 ring-border outline-none",
              side === "right" ? "right-0 max-w-xl" : "left-0 max-w-[290px]", className)}
            {...props}
          >
            {children}
            <SheetPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" aria-label="Закрыть" />}>
              <X />
            </SheetPrimitive.Close>
          </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("grid gap-1 border-b px-6 py-5 pr-14", className)} {...props} />
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("flex-1 overflow-y-auto px-6 py-5", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("flex justify-end gap-2 border-t bg-muted/50 px-6 py-3", className)} {...props} />
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-base font-semibold", className)} {...props} />
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription }
