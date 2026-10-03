import { AlertTriangle, CircleCheck, CircleX, Clock3, LoaderCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { LiveEvent, TraceEvent } from "@/lib/api"
import { hasStructuredRepair, recoveredAttempts, runPresentation, type RunPresentationInput } from "@/lib/run-presentation"

export function RunStatusBadge(props: RunPresentationInput) {
  const { t } = useTranslation()
  const item = runPresentation(props)
  const Icon = item.status === "running" ? LoaderCircle
    : ["pending", "cancellation_requested"].includes(item.status) ? Clock3
    : ["partial", "revisionLimit"].includes(item.status) ? AlertTriangle
    : item.status === "completed" ? CircleCheck : CircleX
  return <Badge variant={item.variant} className="gap-1.5"><Icon className={item.status === "running" ? "size-3 animate-spin" : "size-3"} />{t(item.key)}</Badge>
}

/** Explicit repair evidence is a notice, never a replacement for terminal failure. */
export function RunRecoveryNotice({ events }: { events: readonly (LiveEvent | TraceEvent)[] }) {
  const { t } = useTranslation()
  const repaired = hasStructuredRepair(events)
  if (!repaired && recoveredAttempts(events).size === 0) return null
  const key = repaired ? "integrationPolish.recoveryNotice" : "integrationPolish.recoveredToolNotice"
  return <p className="mt-3 text-sm text-muted-foreground" role="status">{t(key)}</p>
}
