import { Activity, BrainCircuit, CircleCheck, Eye, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { TraceEvent } from "@/lib/api"

function summary(event: TraceEvent, translate: (key: string) => string) {
  const message = event.payload.message
  const known: Record<string, string> = {
    "orchestration.manager_discovery_completed": "runs.managerSelected",
    "orchestration.manager_selected": "runs.managerSelected",
    "orchestration.specialist_selected": "runs.specialistSelected",
    "orchestration.tool_execution_started": "runs.toolStarted",
    "orchestration.tool_execution_completed": "runs.toolCompleted",
    "orchestration.tool_execution_failed": "runs.toolFailed",
  }
  if (known[event.event_type]) return translate(known[event.event_type])
  if (typeof message === "string" && message) {
    if (message === "No matching manager was found") return translate("runs.noManager")
    return message
  }
  return event.event_type.replace(/^(orchestration|studio)\./, "").replaceAll("_", " ")
}

function metadata(event: TraceEvent) {
  const value = event.payload.metadata
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function ToolActivity({ event }: { event: TraceEvent }) {
  const data = metadata(event)
  if (event.event_type === "studio.tool_decision") return <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3"><p className="flex items-center gap-2 text-sm font-medium"><BrainCircuit className="size-4 text-violet-500" />Decision: {data.action === "tool_call" ? `Use Tool: ${String(data.tool_name ?? "Unknown")}` : "Final Answer"}</p>{data.reason ? <p className="mt-2 text-xs text-muted-foreground">{String(data.reason)}</p> : null}{data.action === "tool_call" ? <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(data.arguments ?? {}, null, 2)}</pre> : null}</div>
  if (event.event_type === "studio.tool_observation") return <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3"><p className="flex items-center gap-2 text-sm font-medium"><Eye className="size-4 text-blue-500" />Observation: {String(data.tool_name ?? "Tool")} {data.success ? "completed successfully" : "failed"}</p>{data.error ? <p className="mt-2 text-xs text-red-600 dark:text-red-300">{String(data.error)}</p> : null}<pre className="mt-2 max-h-44 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(data.output ?? null, null, 2)}</pre></div>
  if (event.event_type.startsWith("orchestration.tool_execution_")) return <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"><Wrench className="size-4 text-primary" />Core ToolExecutor: {String(data.tool_name ?? data.tool_id ?? "Tool")} · {event.event_type.endsWith("started") ? "started" : event.event_type.endsWith("completed") ? "completed" : "failed"}</div>
  if (event.event_type === "studio.tool_loop_limit_reached") return <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">Configured Tool-loop limit reached: {String(data.limit ?? "unknown")} · {String(data.iterations ?? 0)} iterations · {String(data.tool_calls ?? 0)} calls</div>
  if (event.event_type === "studio.tool_loop_completed") return <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs"><CircleCheck className="size-4 text-emerald-500" />Tool loop {data.success ? "completed" : "stopped"} · {String(data.iterations ?? 0)} iterations · {String(data.tool_calls ?? 0)} calls</div>
  return null
}

export function TraceTimeline({ events }: { events: TraceEvent[] }) {
  const { t, i18n } = useTranslation()
  if (!events.length) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No trace events were emitted.</p>
  return (
    <ol className="relative ml-3 border-l border-border">
      {events.map((event) => (
        <li key={event.id} className="relative pb-6 pl-7 last:pb-0">
          <span className="absolute -left-3 grid size-6 place-items-center rounded-full border border-border bg-card"><Activity className="size-3 text-primary" /></span>
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-sm font-medium">{summary(event, t)}</p></div>
              <time className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString(i18n.language)}</time>
            </div>
            {event.agent_name ? <p className="mt-2 text-xs text-muted-foreground">Agent: {event.agent_name}</p> : null}
            <ToolActivity event={event} />
            <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">{t("runs.rawEvent")}</summary><div className="mt-2 rounded-md bg-muted p-3"><p className="mb-2 font-mono text-[11px] text-muted-foreground">{event.event_type}</p><pre className="overflow-x-auto text-xs">{JSON.stringify(event.payload, null, 2)}</pre></div></details>
          </div>
        </li>
      ))}
    </ol>
  )
}
