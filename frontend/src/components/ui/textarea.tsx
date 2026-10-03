import type { TextareaHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground hover:border-border-strong focus:border-primary focus:bg-card focus:ring-3 focus:ring-primary/12 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
