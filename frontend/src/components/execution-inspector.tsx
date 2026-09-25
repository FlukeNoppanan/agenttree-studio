import { Activity, Check, Circle, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import { RunStatusBadge } from "@/components/run-status-badge"
import { Badge } from "@/components/ui/badge"
import { CardTitle } from "@/components/ui/card"
import type { RunDetail, TraceEvent, TreeDetail } from "@/lib/api"

function data(event: TraceEvent): Record<string, unknown> {
  const value = event.payload.metadata
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}

function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>
}

function TraceStep({ event }: { event: TraceEvent }) {
  const { t, i18n } = useTranslation()
  const detail = data(event)
  const kind = event.event_type.replace(/^(orchestration|studio)\./, "")
  const key = `live.events.${kind}`
  const isTool = kind.startsWith("tool_") || kind === "tool_observation"
  const isRevision = kind.includes("revision")
  const fields: Array<[string, string | null]> = [
    [t("live.agent"), event.agent_name],
    [t("live.tool"), safeText(detail.tool_name ?? detail.tool_id)],
    [t("live.provider"), safeText(detail.provider)],
    [t("live.model"), safeText(detail.model)],
    [t("live.reasonSummary"), safeText(detail.feedback)],
    [t("live.revisionNumber"), safeText(detail.requested_revision_number ?? detail.revision_number)],
    [t("live.duration"), safeText(detail.duration_ms) ? `${detail.duration_ms} ms` : null],
  ]
  const hasArguments = isTool && detail.arguments !== undefined
  const hasResult = kind === "tool_observation" && detail.output !== undefined
  return <li className="relative border-l-2 border-border pb-5 pl-6 last:border-transparent last:pb-0"><span className={`absolute -left-2.5 top-1 grid size-5 place-items-center rounded-full border bg-card ${kind.includes("failed") ? "border-destructive text-destructive" : isTool ? "border-info text-info" : isRevision ? "border-warning text-warning" : "border-primary text-primary"}`}><Activity className="size-3" /></span><div className={`min-w-0 border-b bg-transparent pb-4 ${kind.includes("failed") ? "border-destructive/25" : isTool ? "border-info/25" : "border-border"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{i18n.exists(key) ? t(key) : kind.replaceAll("_", " ")}</p>{isRevision ? <Badge variant="warning">{t("live.revisionRequested")}</Badge> : null}{isTool ? <Wrench className="size-3.5 text-info" /> : null}</div><time className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString(i18n.language)} · {event.sequence}</time></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{fields.filter(([, value]) => value).map(([label, value]) => <span key={label} className="break-all">{label}: {value}</span>)}</div>{hasArguments ? <div className="mt-3"><p className="mb-1 text-xs font-medium">{t("live.toolCall")}</p><JsonView value={detail.arguments} /></div> : null}{hasResult ? <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-primary">{t("live.viewResult")}</summary><div className="mt-2"><JsonView value={detail.output} /></div></details> : null}{kind === "tool_observation" && detail.error ? <p className="mt-2 break-words text-xs text-destructive">{safeText(detail.error)}</p> : null}</div></li>
}

export function ExecutionInspector({ run, tree }: { run: RunDetail; tree: TreeDetail | null }) {
  const { t, i18n } = useTranslation()
  const trace = [...run.trace].sort((a, b) => a.sequence - b.sequence)
  const sameVersion = tree?.version.id === run.tree_version_id
  const agents = sameVersion ? tree.version.agents : []
  const seen = new Set(trace.map((event) => event.agent_id).filter(Boolean))
  const latest = run.status === "running" ? trace.at(-1) : null
  const observed = new Map<string, { id: string; name: string; agent_type: "root" | "manager" | "specialist" }>()
  for (const event of trace) {
    if (!event.agent_id || !event.agent_name) continue
    const kind = event.event_type
    const role = /specialist|tool_/.test(kind) ? "specialist" : /manager|subtask|revision/.test(kind) ? "manager" : /triage|final_review|final_result|^orchestration.started$/.test(kind) ? "root" : null
    if (role) observed.set(event.agent_id, { id: event.agent_id, name: event.agent_name, agent_type: role })
  }
  const hierarchy = (sameVersion ? agents.filter((agent) => seen.has(agent.id) || (agent.agent_type === "root" && trace.some((event) => event.event_type === "orchestration.started"))) : [...observed.values()]).sort((a, b) => ({ root: 0, manager: 1, specialist: 2 })[a.agent_type] - ({ root: 0, manager: 1, specialist: 2 })[b.agent_type])
  const executionResult = run.state?.execution_result as Record<string, unknown> | undefined
  const managers = Array.isArray(executionResult?.manager_executions) ? executionResult.manager_executions : []
  const models = managers.flatMap((manager) => {
    const entries = (manager as Record<string, unknown>).specialist_executions
    return Array.isArray(entries) ? entries : []
  }).map((entry) => {
    const item = entry as Record<string, unknown>
    const result = item.agent_result as Record<string, unknown> | undefined
    const metadata = result?.metadata as Record<string, unknown> | undefined
    return { agent: agents.find((agent) => agent.id === item.specialist_id)?.name ?? observed.get(String(item.specialist_id))?.name, provider: safeText(metadata?.provider), model: safeText(metadata?.model) }
  }).filter((item) => item.provider || item.model)
  const inputText = Object.values(run.input).length === 1 && typeof Object.values(run.input)[0] === "string" ? Object.values(run.input)[0] as string : null

  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("live.executionInspector")}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">{t("live.execution")} #{run.id.slice(0, 8)}</h1><RunStatusBadge status={run.status} /></div><p className="mt-2 text-sm text-muted-foreground">{run.tree_name} · {t("live.inputSource")}: {run.invocation_source === "studio_test" ? t("live.studio") : t("live.api")} · {t("live.started")}: {new Date(run.started_at).toLocaleString(i18n.language)} · {t("live.duration")}: {run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</p></header>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
    <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.input")}</CardTitle></div><div>{inputText ? <p className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">{inputText}</p> : <details open><summary className="cursor-pointer text-xs font-medium text-primary">{t("live.prettyView")}</summary><div className="mt-2"><JsonView value={run.input} /></div></details>}{inputText ? null : <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">{t("live.rawJson")}</summary><div className="mt-2"><JsonView value={run.input} /></div></details>}</div></section>
      <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.agentHierarchy")}</CardTitle></div><div className="space-y-2">{hierarchy.length ? hierarchy.map((agent) => { const completed = trace.some((event) => event.agent_id === agent.id && /completed|passed/.test(event.event_type)); const active = latest?.agent_id === agent.id; return <div key={agent.id}><div className={`flex items-center gap-2 border-b py-3 text-sm ${active ? "border-primary bg-primary/5" : "border-border"}`}>{completed ? <Check className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}<span className="min-w-0 break-words font-medium">{agent.name}</span><span className="ml-auto text-xs text-muted-foreground">{t(`agents.${agent.agent_type}`)}</span></div></div> }) : <p className="text-sm text-muted-foreground">{t("live.hierarchyUnavailable")}</p>}</div></section>
    </div>
    {models.length ? <section className="min-w-0"><div className="py-4"><CardTitle>{t("agents.provider")} / {t("agents.model")}</CardTitle></div><div className="flex flex-wrap gap-3">{models.map((item, index) => <div key={index} className="border-l-2 border-earth/30 pl-3 text-sm"><p className="font-medium">{item.agent ?? t("agents.specialist")}</p>{item.provider ? <p className="mt-1">{t("live.provider")}: {item.provider}</p> : null}{item.model ? <p>{t("live.model")}: {item.model}</p> : null}</div>)}</div></section> : null}
    <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.executionTrace")}</CardTitle></div><div>{trace.length ? <ol>{trace.map((event) => <TraceStep key={event.id} event={event} />)}</ol> : <p className="text-sm text-muted-foreground">{t("live.noActivity")}</p>}</div></section>
    {run.status === "failed" ? <section className="min-w-0 border-destructive/25"><div className="py-4"><CardTitle>{t("live.executionFailed")}</CardTitle></div><div><p className="text-sm text-destructive">{run.error_message ?? run.error_code ?? t("live.noErrorDetails")}</p>{run.error_code ? <details className="mt-3"><summary className="cursor-pointer text-xs">{t("common.technicalDetails")}</summary><p className="mt-2 font-mono text-xs">{run.error_code}</p></details> : null}</div></section> : null}
    {run.status === "completed" ? <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.finalResult")}</CardTitle></div><div>{run.output ? <JsonView value={run.output.value} /> : <p className="text-sm text-muted-foreground">{t("live.noFinalResult")}</p>}</div></section> : null}
  </div>
}
