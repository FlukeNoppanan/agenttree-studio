import { HumanExecutionTrace } from "@/components/human-execution-trace"
import { Check, Circle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { RunStatusBadge, RunRecoveryNotice } from "@/components/run-status-badge"
import { CardTitle } from "@/components/ui/card"
import type { RunDetail, TreeDetail } from "@/lib/api"

function safeText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}

function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>
}


export function ExecutionInspector({ run, tree, showTrace = true }: { run: RunDetail; tree: TreeDetail | null; showTrace?: boolean }) {
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
    <header><p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("live.executionInspector")}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{t("live.execution")} #{run.id.slice(0, 8)}</h2><RunStatusBadge {...run} /></div><p className="mt-2 text-sm text-muted-foreground">{run.tree_name} · {t("live.inputSource")}: {run.invocation_source === "studio_test" ? t("live.studio") : t("live.api")} · {t("live.started")}: {new Date(run.started_at).toLocaleString(i18n.language)} · {t("live.duration")}: {run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</p></header>
    <RunRecoveryNotice events={trace} />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
    <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.input")}</CardTitle></div><div>{inputText ? <p className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">{inputText}</p> : <details open><summary className="cursor-pointer text-xs font-medium text-primary">{t("live.prettyView")}</summary><div className="mt-2"><JsonView value={run.input} /></div></details>}{inputText ? null : <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">{t("live.rawJson")}</summary><div className="mt-2"><JsonView value={run.input} /></div></details>}</div></section>
      <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.agentHierarchy")}</CardTitle></div><div className="space-y-2">{hierarchy.length ? hierarchy.map((agent) => { const completed = trace.some((event) => event.agent_id === agent.id && /completed|passed/.test(event.event_type)); const active = latest?.agent_id === agent.id; return <div key={agent.id}><div className={`flex items-center gap-2 border-b py-3 text-sm ${active ? "border-primary bg-primary/5" : "border-border"}`}>{completed ? <Check className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}<span className="min-w-0 break-words font-medium">{agent.name}</span><span className="ml-auto text-xs text-muted-foreground">{t(`agents.${agent.agent_type}`)}</span></div></div> }) : <p className="text-sm text-muted-foreground">{t("live.hierarchyUnavailable")}</p>}</div></section>
    </div>
    {models.length ? <section className="min-w-0"><div className="py-4"><CardTitle>{t("agents.provider")} / {t("agents.model")}</CardTitle></div><div className="flex flex-wrap gap-3">{models.map((item, index) => <div key={index} className="border-l-2 border-earth/30 pl-3 text-sm"><p className="font-medium">{item.agent ?? t("agents.specialist")}</p>{item.provider ? <p className="mt-1">{t("live.provider")}: {item.provider}</p> : null}{item.model ? <p>{t("live.model")}: {item.model}</p> : null}</div>)}</div></section> : null}
    {showTrace && <HumanExecutionTrace events={trace} tree={sameVersion ? tree : null} />}
    {run.status === "failed" ? <section className="min-w-0 border-destructive/25"><div className="py-4"><CardTitle>{t("live.executionFailed")}</CardTitle></div><div><p className="text-sm text-destructive">{run.error_message ?? run.error_code ?? t("live.noErrorDetails")}</p>{run.error_code ? <details className="mt-3"><summary className="cursor-pointer text-xs">{t("common.technicalDetails")}</summary><p className="mt-2 font-mono text-xs">{run.error_code}</p></details> : null}</div></section> : null}
    {run.status === "completed" ? <section className="min-w-0"><div className="py-4"><CardTitle>{t("live.finalResult")}</CardTitle></div><div>{run.output ? <JsonView value={run.output.value} /> : <p className="text-sm text-muted-foreground">{t("live.noFinalResult")}</p>}</div></section> : null}
  </div>
}
