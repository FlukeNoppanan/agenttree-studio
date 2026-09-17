import type { SelectHTMLAttributes } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex h-10 w-full appearance-none rounded-lg border border-border bg-card/90 px-3 py-2 pr-9 text-sm shadow-sm outline-none transition-[border-color,box-shadow,background-color] hover:border-primary/25 focus:border-primary focus:bg-card focus:ring-3 focus:ring-primary/12 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { Select }
