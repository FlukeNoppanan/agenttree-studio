import type { InputHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground hover:border-border-strong focus:border-primary focus:bg-card focus:ring-3 focus:ring-primary/12 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
