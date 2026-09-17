import { CircleCheck, CircleX, CircleOff, Clock3 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { ToolConnection } from "@/lib/api"

const states = {
  connected: { icon: CircleCheck, variant: "success" as const, label: "Connected" },
  error: { icon: CircleX, variant: "destructive" as const, label: "Error" },
  disabled: { icon: CircleOff, variant: "secondary" as const, label: "Disabled" },
  not_configured: { icon: Clock3, variant: "secondary" as const, label: "Not configured" },
}

export function ToolStatusBadge({ status }: { status: ToolConnection["status"] }) {
  const state = states[status]
  const Icon = state.icon
  return <Badge variant={state.variant} className="gap-1.5"><Icon className="size-3" />{state.label}</Badge>
}
