import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="relative flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2.5">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-[2rem]">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  )
}
