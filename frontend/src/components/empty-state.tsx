import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  title: string
  description: string
  icon: LucideIcon
}

export function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <div className="relative flex min-h-44 flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-4 rounded-lg bg-secondary p-2.5 text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <h2 className="relative text-base font-semibold">{title}</h2>
      <p className="relative mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
