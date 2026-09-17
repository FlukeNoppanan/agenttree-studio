import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  title: string
  description: string
  icon: LucideIcon
}

export function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <div className="brand-grid relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/20 bg-card/80 p-8 text-center">
      <div className="absolute inset-0 bg-gradient-to-b from-card/45 to-card/95" />
      <div className="relative mb-4 rounded-2xl border border-primary/15 bg-secondary/80 p-3.5 text-primary shadow-sm">
        <Icon className="size-6" />
      </div>
      <h2 className="relative text-base font-semibold">{title}</h2>
      <p className="relative mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
