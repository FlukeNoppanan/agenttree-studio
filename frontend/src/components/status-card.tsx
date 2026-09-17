import type { LucideIcon } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface StatusCardProps {
  title: string
  description: string
  detail?: string
  icon: LucideIcon
  available: boolean
  connectedLabel?: boolean
}

export function StatusCard({
  title,
  description,
  detail,
  icon: Icon,
  available,
  connectedLabel,
}: StatusCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="rounded-lg border border-border bg-muted/60 p-2.5 text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between border-t border-border/70 bg-muted/20 py-4">
        <StatusBadge
          status={available ? "available" : "unavailable"}
          connectedLabel={connectedLabel}
        />
        {detail ? <span className="font-mono text-xs text-muted-foreground">{detail}</span> : null}
      </CardContent>
    </Card>
  )
}
