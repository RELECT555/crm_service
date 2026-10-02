import * as React from "react"
import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-[13px] leading-none font-medium select-none", className)}
      {...props}
    />
  )
}

export { Label }
