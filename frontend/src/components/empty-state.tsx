import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface EmptyStateProps {
  title: string
  description: string
  icon: LucideIcon
  action?: ReactNode
}

export function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="relative flex min-h-44 flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-4 rounded-lg bg-accent p-2.5 text-primary">
        <Icon className="size-6" />
      </div>
      <h2 className="relative text-base font-semibold">{title}</h2>
      <p className="relative mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="relative mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
