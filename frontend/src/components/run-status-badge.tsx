import { CircleCheck, CircleX, Clock3, LoaderCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { RunStatus } from "@/lib/api"

const items = {
  pending: { icon: Clock3, variant: "warning" as const },
  running: { icon: LoaderCircle, variant: "info" as const },
  completed: { icon: CircleCheck, variant: "success" as const },
  failed: { icon: CircleX, variant: "destructive" as const },
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useTranslation()
  const item = items[status]
  const Icon = item.icon
  return <Badge variant={item.variant} className="gap-1.5"><Icon className={status === "running" ? "size-3 animate-spin" : "size-3"} />{t(`status.${status}`)}</Badge>
}
