import { CircleCheck, CircleX, CircleOff, Clock3 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { ToolConnection } from "@/lib/api"

const states = {
  connected: { icon: CircleCheck, variant: "success" as const, label: "status.connected" },
  error: { icon: CircleX, variant: "destructive" as const, label: "status.error" },
  disabled: { icon: CircleOff, variant: "secondary" as const, label: "common.disabled" },
  not_configured: { icon: Clock3, variant: "secondary" as const, label: "toolUx.notTested" },
}

export function ToolStatusBadge({ status }: { status: ToolConnection["status"] }) {
  const { t } = useTranslation()
  const state = states[status]
  const Icon = state.icon
  return <Badge variant={state.variant} className="gap-1.5"><Icon className="size-3" />{t(state.label)}</Badge>
}
