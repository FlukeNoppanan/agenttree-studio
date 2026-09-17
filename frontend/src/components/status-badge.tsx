import { CircleCheck, CircleX, LoaderCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"

type Status = "available" | "unavailable" | "loading"

const content = {
  available: { label: "Available", icon: CircleCheck, variant: "success" as const },
  unavailable: { label: "Unavailable", icon: CircleX, variant: "destructive" as const },
  loading: { label: "Checking", icon: LoaderCircle, variant: "secondary" as const },
}

interface StatusBadgeProps {
  status: Status
  connectedLabel?: boolean
}

export function StatusBadge({ status, connectedLabel = false }: StatusBadgeProps) {
  const item = content[status]
  const Icon = item.icon
  const label = connectedLabel
    ? status === "available"
      ? "Connected"
      : status === "unavailable"
        ? "Disconnected"
        : item.label
    : item.label

  return (
    <Badge variant={item.variant} className="gap-1.5">
      <Icon className={status === "loading" ? "size-3 animate-spin" : "size-3"} />
      {label}
    </Badge>
  )
}
