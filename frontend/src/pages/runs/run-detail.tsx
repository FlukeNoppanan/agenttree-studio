import { ArrowLeft, Copy, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"

import { ExecutionInspector } from "@/components/execution-inspector"
import { RunArtifacts } from "@/components/live/run-artifacts"
import { RunTimeline } from "@/components/live/run-timeline"
import { PlaygroundResult } from "@/components/playground-result"
import { Notice } from "@/components/notice"
import { RunStatusBadge, RunRecoveryNotice } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError, type LiveArtifact, type LiveRun, type RunDetail, type TreeDetail } from "@/lib/api"
import { emptyLiveModel, openRunStream, reduceLive, type ConnectionState, type LiveModel } from "@/lib/run-live"

const terminal = new Set(["completed", "failed", "cancelled"])
function metricNumbers(value: unknown, prefix = ""): Array<[string, number]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? `${prefix} · ${key.replaceAll("_", " ")}` : key.replaceAll("_", " ")
    if (typeof item === "number" && Number.isFinite(item)) return [[name, item] as [string, number]]
    if (item && typeof item === "object" && !Array.isArray(item) && prefix.length < 30) return metricNumbers(item, name)
    return []
  }).slice(0, 20)
}

export function RunDetailPage() {
  const { runId } = useParams()
  const [query] = useSearchParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [run, setRun] = useState<LiveRun | null>(null)
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [legacy, setLegacy] = useState<RunDetail | null>(null)
  const [model, setModel] = useState<LiveModel>(emptyLiveModel)
  const [artifacts, setArtifacts] = useState<LiveArtifact[]>([])
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [error, setError] = useState<string | null>(null)
  const [lostAccess, setLostAccess] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [rawResult, setRawResult] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const cursor = useRef(0)
  const refresh = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (!runId) return
    let active = true
    let closeStream: (() => void) | null = null
    let currentStatus = "queued"
    let deltaTimer: number | null = null
    let pendingDeltas: Parameters<typeof reduceLive>[1][] = []
    cursor.current = 0
    setModel(emptyLiveModel); setRun(null); setTree(null); setLegacy(null); setArtifacts([]); setLostAccess(false)
    const loseAccess = () => {
      if (!active) return
      setLostAccess(true); setRun(null); setModel(emptyLiveModel); setArtifacts([]); setLegacy(null)
      closeStream?.()
    }
    const update = (caught: unknown) => {
      if (!active) return
      if (caught instanceof ApiError && [401, 403, 404].includes(caught.status)) loseAccess()
      else setError(caught instanceof Error ? caught.message : t("liveV2.loadError"))
    }
    const loadState = async () => {
      try {
        const state = await api.getLiveRun(runId)
        if (!active) return
        currentStatus = state.status
        setRun(state); setError(null)
        if (terminal.has(state.status)) {
          closeStream?.(); closeStream = null; setConnection("ended")
          const [result, artifactPage, stored] = await Promise.all([api.getLiveResult(runId), api.getLiveArtifacts(runId), api.getRun(runId).catch(() => null)])
          if (active) { setRun(previous => previous ? { ...previous, final_output: result.final_output, final_status: result.final_status } : state); setArtifacts(artifactPage.artifacts); setLegacy(stored) }
        }
      } catch (caught) { update(caught) }
    }
    refresh.current = loadState
    const boot = async () => {
      try {
        const state = await api.getLiveRun(runId)
        if (!active) return
        currentStatus = state.status
        setRun(state)
        const [artifactPage, detail] = await Promise.all([
          api.getLiveArtifacts(runId), api.getTree(state.tree_id).catch(() => null),
        ])
        if (!active) return
        setArtifacts(artifactPage.artifacts)
        if (detail && detail.current_version_id !== state.tree_version_id) {
          const pinned = await api.getTreeVersion(state.tree_id, state.tree_version_id).catch(() => null)
          if (!active) return
          setTree(pinned ? { ...detail, version: pinned, current_version_id: pinned.id } : null)
        } else setTree(detail)
        let after = 0
        do {
          const page = await api.getLiveEvents(runId, after)
          if (!active) return
          setModel(previous => page.events.reduce((current, event) => reduceLive(current, { event }), previous))
          after = page.next_after
          cursor.current = Math.max(cursor.current, after)
          if (!page.has_more || page.events.length === 0) break
        } while (active)
        if (state.latest_event_sequence === 0) {
          const history = await api.getRun(runId).catch(() => null)
          if (active) setLegacy(history)
        }
        if (terminal.has(state.status)) { await loadState(); return }
        closeStream = openRunStream(runId, {
          cursor: () => cursor.current,
          onEvent: event => {
            if (!active) return
            cursor.current = Math.max(cursor.current, event.sequence)
            setModel(previous => reduceLive(previous, { event }))
            if (event.type === "artifact.committed") void api.getLiveArtifacts(runId).then(page => { if (active) setArtifacts(page.artifacts) }).catch(update)
            if (event.type === "output.final.available" || event.type.startsWith("execution.completed") || event.type.startsWith("execution.failed") || event.type.startsWith("execution.cancelled")) void loadState()
          },
          onDelta: delta => {
            if (!active) return
            pendingDeltas.push({ delta })
            if (deltaTimer === null) deltaTimer = window.setTimeout(() => {
              const batch = pendingDeltas
              pendingDeltas = []; deltaTimer = null
              if (active) setModel(previous => batch.reduce(reduceLive, previous))
            }, 50)
          },
          onConnection: value => { if (active) setConnection(value) },
          onAuthorizationLost: loseAccess,
        })
      } catch (caught) { update(caught) }
    }
    void boot()
    const timer = window.setInterval(() => { if (active && !document.hidden && !terminal.has(currentStatus)) void loadState() }, 3000)
    return () => { active = false; window.clearInterval(timer); if (deltaTimer !== null) window.clearTimeout(deltaTimer); closeStream?.() }
  }, [runId, t])
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [])

  const cancel = async () => {
    if (!runId || cancelling || !window.confirm(t("liveV2.cancelConfirm"))) return
    setCancelling(true)
    try { await api.cancelLiveRun(runId); await refresh.current() }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("liveV2.loadError")) }
    finally { setCancelling(false) }
  }
  if (lostAccess) return <div className="space-y-4"><Notice tone="error" message={t("liveV2.accessLost")} onDismiss={() => navigate("/executions")} /><Button onClick={() => navigate("/executions")}>{t("liveV2.back")}</Button></div>
  if (!run) return error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : <Skeleton className="h-96 w-full" />
  const active = !terminal.has(run.status)
  const elapsed = run.started_at ? Math.max(0, Math.floor(((run.finished_at ? new Date(run.finished_at).getTime() : clock) - new Date(run.started_at).getTime()) / 1000)) : 0
  const rootText = Object.entries(model.text).filter(([key]) => key.startsWith("root:")).map(([, value]) => value).join("\n")
  return <div className="min-w-0 space-y-4">
    <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary" onClick={() => navigate("/executions")}><ArrowLeft className="size-4" />{t("consolidation.backExecutions")}</button>
    {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
    <header className="border-b border-border pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("consolidation.detail")}</p>{tree && <Button variant="outline" onClick={() => navigate(`/trees/${run.tree_id}/playground?run=${runId}`)}>Playground</Button>}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="break-words text-base font-semibold">{tree?.name ?? run.tree_id}</h1><RunStatusBadge {...run} /></div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{t("liveV2.version")}: {tree?.version.id === run.tree_version_id ? `v${tree.version.version_number}` : run.tree_version_id.slice(0, 8)}</span><span className="break-all">{t("liveV2.runId")}: {run.run_id}</span><span>{t("liveV2.created")}: {new Date(run.created_at).toLocaleString(i18n.language)}</span><span>{t("liveV2.started")}: {run.started_at ? new Date(run.started_at).toLocaleString(i18n.language) : "—"}</span><span>{t("liveV2.elapsed")}: {elapsed}s</span>{run.finished_at ? <span>{t("liveV2.finished")}: {new Date(run.finished_at).toLocaleString(i18n.language)}</span> : null}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><span role="status" className="text-sm">{t("liveV2.connection")}: {t(`liveV2.connectionState.${connection}`)}</span><Button variant="outline" onClick={() => void navigator.clipboard?.writeText(run.run_id)}><Copy className="size-4" />{t("liveV2.copyId")}</Button>{active && run.status !== "cancellation_requested" ? <Button variant="outline" disabled={cancelling} onClick={() => void cancel()}><XCircle className="size-4" />{t("liveV2.cancel")}</Button> : null}</div>
      {run.status === "queued" ? <p className="mt-3 text-sm text-muted-foreground">{t("liveV2.queued")}</p> : null}
      {run.status === "cancellation_requested" ? <p className="mt-3 text-sm text-warning">{t("liveV2.cancellationRequested")}</p> : null}
      {active && connection === "reconnecting" ? <p className="mt-3 text-sm text-warning">{t("liveV2.reconnectingHelp")}</p> : null}
      {run.status === "failed" && run.error ? <p role="alert" className="mt-3 text-sm text-destructive">{t(`liveV2.errors.${run.error.code}`, { defaultValue: run.error.code.replaceAll("_", " ") })}: {run.error.message}</p> : null}
      {run.status === "cancelled" ? <p className="mt-3 text-sm">{t("liveV2.cancelled")}</p> : null}
      {run.final_status === "partial" ? <p className="mt-3 text-sm text-warning">{t("liveV2.partialHelp")}</p> : null}
      <RunRecoveryNotice events={model.events} />
    </header>
    <section className="border-t border-border pt-5" aria-live="polite"><h2 className="text-base font-semibold">{t("runs.result")}</h2>{run.final_output !== null ? <><div className="mt-2 flex gap-1"><Button size="sm" variant={rawResult ? "ghost" : "outline"} aria-pressed={!rawResult} onClick={() => setRawResult(false)}>{t("playground.formatted")}</Button><Button size="sm" variant={rawResult ? "outline" : "ghost"} aria-pressed={rawResult} onClick={() => setRawResult(true)}>{t("playground.raw")}</Button></div><PlaygroundResult value={run.final_output} raw={rawResult} /></> : rootText && active ? <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{rootText}</pre> : <p className="mt-3 text-sm text-muted-foreground">{t(active ? "liveV2.outputPending" : "live.noFinalResult")}</p>}</section>
    <details open={active || query.get('section') === 'timeline' || undefined} className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium">{t('liveV2.timeline')}</summary><RunTimeline model={model} tree={tree} versionId={run.tree_version_id} /></details>
    <RunArtifacts runId={run.run_id} artifacts={artifacts} />
    {run.usage || run.metrics ? <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">{t("liveV2.metrics")}</summary><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">{metricNumbers({ usage: run.usage, metrics: run.metrics }).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value.toLocaleString(i18n.language)}</dd></div>)}</dl></details> : null}
    {legacy ? <details open={query.get("trace") === "1" || undefined} className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">{t("playground.fullTrace")}</summary><ExecutionInspector run={legacy} tree={tree} /></details> : null}
    <details className="border-t border-border pt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("liveV2.durability")}</summary><p className="mt-2">{t("liveV2.durabilityHelp")}</p></details>
  </div>
}
