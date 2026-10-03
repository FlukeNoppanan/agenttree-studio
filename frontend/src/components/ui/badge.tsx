import type { HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        success: "border-success/20 bg-success-subtle text-success",
        destructive: "border-destructive/20 bg-danger-subtle text-destructive",
        secondary: "border-border bg-secondary/70 text-secondary-foreground",
        warning: "border-warning/25 bg-warning-subtle text-warning",
        info: "border-info/20 bg-info-subtle text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
