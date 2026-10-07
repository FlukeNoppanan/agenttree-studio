import { Activity, Check, AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { traceActivities, traceMetadata } from "@/lib/trace-activity"
import type { TraceEvent, TreeDetail } from "@/lib/api"

export function TechnicalTrace({ events }: { events: TraceEvent[] }) {
  const { t, i18n } = useTranslation()
  return <details className="technical-trace"><summary>{t("baseline.trace.technical", {count: events.length})}</summary><ol className="mt-3 divide-y divide-border">{[...events].sort((a,b) => a.sequence - b.sequence).map(event => <li key={event.id} className="py-2"><details><summary className="flex flex-wrap gap-2 text-xs"><span className="font-mono">#{event.sequence} · {event.event_type}</span><span>{event.agent_name ?? event.agent_id ?? t("liveV2.system")}</span><time className="ml-auto">{new Date(event.created_at).toLocaleString(i18n.language)}</time></summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify(event, null, 2)}</pre></details></li>)}</ol></details>
}
export function HumanExecutionTrace({ events, tree }: { events: TraceEvent[]; tree?: TreeDetail | null }) {
  const { t, i18n } = useTranslation()
  const activities = traceActivities(events, tree)
  let previous = ""
  return <section className="human-trace min-w-0" aria-label={t("baseline.trace.title")}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold">{t("baseline.trace.title")}</h2><span className="text-xs text-muted-foreground">{t("baseline.trace.count", {count: events.length})}</span></div>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("baseline.trace.help")}</p>
    <ol className="mt-4">{activities.map(item => {
      const heading = previous !== item.stage; previous = item.stage
      const Icon = item.outcome === "error" || item.outcome === "warning" ? AlertTriangle : item.outcome === "success" ? Check : Activity
      const meta = traceMetadata(item.event)
      return <li key={item.event.id} className="min-w-0">{heading && <h3 className="trace-stage">{t(`baseline.trace.stages.${item.stage}`)}</h3>}
        <div className="trace-activity" data-outcome={item.outcome}>
          <span className="trace-marker"><Icon className="size-3.5" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-sm font-medium">{t(`baseline.trace.actions.${item.key}.title`)}</p><time className="ml-auto text-xs text-muted-foreground">{new Date(item.event.created_at).toLocaleTimeString(i18n.language)}</time></div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(`baseline.trace.actions.${item.key}.help`)}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className="font-medium">{item.actor ?? t("liveV2.system")}{item.role ? ` · ${t(`liveV2.role.${item.role}`)}` : ""}</span>{item.context.map(([label,value],index) => <span key={`${label}-${index}`} className="break-words text-muted-foreground">{t(`baseline.trace.fields.${label}`)}: {label === "strategy" ? t(`compatibility.checks.${value}`, {defaultValue: value}) : label === "reason" ? t(`compatibility.reasons.${value}`, {defaultValue: value}) : value}</span>)}</div>
            {item.stage === "resource" && meta.arguments !== undefined && <details className="mt-2 text-xs"><summary>{t("live.toolCall")}</summary><pre className="mt-2 max-h-64 overflow-auto bg-muted p-3">{JSON.stringify(meta.arguments, null, 2)}</pre></details>}
            {item.stage === "resource" && meta.output !== undefined && <details className="mt-2 text-xs"><summary>{t("live.viewResult")}</summary><pre className="mt-2 max-h-64 overflow-auto bg-muted p-3">{JSON.stringify(meta.output, null, 2)}</pre></details>}
            <details className="mt-2 text-xs text-muted-foreground"><summary>{t("baseline.trace.eventDetails")}</summary><p className="mt-2 break-all font-mono">#{item.event.sequence} · {item.event.event_type} {meta.operation_id ? `· ${String(meta.operation_id)}` : ""}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted/40 p-3">{JSON.stringify(item.event, null, 2)}</pre></details>
          </div>
        </div>
      </li>
    })}</ol>
    {!activities.length && <p className="py-5 text-sm text-muted-foreground">{t("liveV2.waitingEvents")}</p>}
    <TechnicalTrace events={events} />
  </section>
}
