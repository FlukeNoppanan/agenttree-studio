import { Activity, ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type RunStatus, type TreeLive } from "@/lib/api"
import { cn } from "@/lib/utils"

type Filter = "all" | RunStatus
const filters: Filter[] = ["all", "running", "pending", "completed", "failed"]

function inputSummary(input: Record<string, unknown>) {
  const text = Object.values(input).find((value) => typeof value === "string")
  return typeof text === "string" ? text : JSON.stringify(input)
}

function eventLabel(eventType: string, translate: (key: string) => string, exists: (key: string) => boolean) {
  const kind = eventType.replace(/^(orchestration|studio)\./, "")
  const key = `live.events.${kind}`
  return exists(key) ? translate(key) : kind.replaceAll("_", " ")
}

function uptime(startedAt: string | null) {
  if (!startedAt) return "—"
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

export function TreeLivePage() {
  const { treeId } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [snapshot, setSnapshot] = useState<TreeLive | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!treeId) return
    let active = true
    let busy = false
    const refresh = async () => {
      if (busy || document.hidden) return
      busy = true
      try {
        const result = await api.getTreeLive(treeId)
        if (active) { setSnapshot(result); setError(null) }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : t("live.loadError"))
      } finally { busy = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [treeId, t])

  const executions = useMemo(() => snapshot?.executions.filter(({ run }) =>
    (filter === "all" || run.status === filter) &&
    (`${run.id} ${inputSummary(run.input)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  ) ?? [], [snapshot, filter, search])

  if (!snapshot && !error) return <Skeleton className="h-96 w-full" />
  return <div className="space-y-6">
    <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" onClick={() => navigate(`/trees/${treeId}`)}><ArrowLeft className="size-4" />{t("live.backToTree")}</button>
    {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
    {snapshot ? <>
      <header className="border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("live.title")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">{snapshot.tree_name}</h1><Badge variant={snapshot.runtime_status === "running" ? "success" : snapshot.runtime_status === "error" ? "destructive" : "secondary"}>{t(`runtimeState.${snapshot.runtime_status}`)}</Badge></div>
        {snapshot.runtime_status === "unavailable" ? <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{t("designV3.runtimeHelp")}</p> : null}
        <div className="metric-strip mt-4">{([
          ["active", snapshot.active_count], ["queued", snapshot.queued_count],
          ["completed", snapshot.completed_count], ["failed", snapshot.failed_count],
        ] as const).map(([label, count]) => <div key={label} className="flex items-baseline gap-2"><p className="text-xs text-muted-foreground">{t(`live.${label}`)}</p><p className="text-xl font-semibold tabular-nums">{count}</p></div>)}</div>
        {snapshot.runtime_status !== "unavailable" ? <p className="mt-3 text-xs text-muted-foreground">{t("live.runtimeStatus")}: {t(`runtimeState.${snapshot.runtime_status}`)} · {t("live.started")}: {snapshot.runtime_started_at ? new Date(snapshot.runtime_started_at).toLocaleString(i18n.language) : "—"} · {t("live.uptime")}: {snapshot.runtime_status === "running" ? uptime(snapshot.runtime_started_at) : "—"}</p> : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.7fr)]">
        <section className="min-w-0 space-y-4" aria-label={t("live.executions")}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("live.executions")}</h2><p className="text-sm text-muted-foreground">{t("live.executionsHelp")}</p></div><RefreshCw className="size-4 text-muted-foreground" aria-label={t("live.polling")} /></div>
          <div className="studio-tabs">{filters.map((item) => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)} className={cn("px-3 py-2 text-sm font-medium", filter === item ? "text-primary" : "text-muted-foreground hover:text-foreground")}>{t(item === "pending" ? "live.queued" : item === "all" ? "live.all" : `status.${item}`)}</button>)}</div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("live.search")} aria-label={t("live.search")} />
          {executions.length ? <div className="border-t border-border">{executions.map(({ run, current_agent, current_stage, current_tool }) => <article key={run.id} className="execution-row min-w-0 flex-col sm:flex-row"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">#{run.id.slice(0, 8)}</span><RunStatusBadge status={run.status} /><span className="text-xs text-muted-foreground">{t("live.inputSource")}: {run.invocation_source === "studio_test" ? t("live.studio") : t("live.api")}</span></div><p className="line-clamp-2 break-words font-medium">{inputSummary(run.input)}</p><p className="break-words text-xs text-muted-foreground">{t("live.currentAgent")}: {current_agent ?? "—"} · {t("live.currentStage")}: {current_stage ? eventLabel(current_stage, t, i18n.exists.bind(i18n)) : "—"}{current_tool ? ` · ${t("live.toolCall")}: ${current_tool}` : ""}</p><p className="text-xs text-muted-foreground">{t("live.started")}: {new Date(run.started_at).toLocaleString(i18n.language)} · {t("live.duration")}: {run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</p>{run.error_message ? <p className="text-xs text-destructive">{run.error_message}</p> : null}</div><Button variant="outline" className="shrink-0 self-start" onClick={() => navigate(`/runs/${run.id}`)}>{t("live.inspect")}<ArrowUpRight className="size-4" /></Button></article>)}</div> : <p className="border-t border-border py-8 text-sm text-muted-foreground">{t("live.noExecutions")}<span className="mt-2 block">{t("designV3.emptyExecutionsHelp")}</span></p>}
        </section>
        <aside className="h-fit min-w-0 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><h2 className="flex items-center gap-2 text-base font-semibold"><Activity className="size-4 text-primary" />{t("live.recentActivity")}</h2><div className="mt-5 space-y-3 border-l border-border pl-4">{snapshot.recent_activity.length ? snapshot.recent_activity.map((event) => <button key={event.id} className="flex w-full min-w-0 gap-3 border-b border-border pb-3 text-left last:border-0" onClick={() => navigate(`/runs/${event.run_id}`)}><time className="shrink-0 text-xs text-muted-foreground">{new Date(event.created_at).toLocaleTimeString(i18n.language)}</time><span className="min-w-0 break-words text-xs"><span className="font-mono text-muted-foreground">#{event.run_id.slice(0, 8)}</span> {eventLabel(event.event_type, t, i18n.exists.bind(i18n))}</span></button>) : <p className="text-sm text-muted-foreground">{t("live.noActivity")}</p>}</div></aside>
      </div>
    </> : null}
  </div>
}
