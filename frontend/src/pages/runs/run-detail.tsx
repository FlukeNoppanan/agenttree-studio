import { ArrowLeft, Copy, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { ExecutionInspector } from "@/components/execution-inspector"
import { RunArtifacts } from "@/components/live/run-artifacts"
import { RunTimeline } from "@/components/live/run-timeline"
import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError, type LiveArtifact, type LiveRun, type RunDetail, type TreeDetail } from "@/lib/api"
import { emptyLiveModel, openRunStream, reduceLive, type ConnectionState, type LiveModel } from "@/lib/run-live"

const terminal = new Set(["completed", "failed", "cancelled"])
function outputText(value: unknown): string { return typeof value === "string" ? value : JSON.stringify(value, null, 2) }

export function RunDetailPage() {
  const { runId } = useParams()
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
          const [result, artifactPage] = await Promise.all([api.getLiveResult(runId), api.getLiveArtifacts(runId)])
          if (active) { setRun(previous => previous ? { ...previous, final_output: result.final_output, final_status: result.final_status } : state); setArtifacts(artifactPage.artifacts) }
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
        setArtifacts(artifactPage.artifacts); setTree(detail)
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
  if (lostAccess) return <div className="space-y-4"><Notice tone="error" message={t("liveV2.accessLost")} onDismiss={() => navigate("/runs")} /><Button onClick={() => navigate("/runs")}>{t("liveV2.back")}</Button></div>
  if (!run) return error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : <Skeleton className="h-96 w-full" />
  const active = !terminal.has(run.status)
  const elapsed = run.started_at ? Math.max(0, Math.floor(((run.finished_at ? new Date(run.finished_at).getTime() : clock) - new Date(run.started_at).getTime()) / 1000)) : 0
  const rootText = Object.entries(model.text).filter(([key]) => key.startsWith("root:")).map(([, value]) => value).join("\n")
  return <div className="min-w-0 space-y-7">
    <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary" onClick={() => navigate(`/trees/${run.tree_id}/live`)}><ArrowLeft className="size-4" />{t("liveV2.back")}</button>
    {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
    <header className="border-b border-border pb-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("liveV2.console")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-semibold md:text-3xl">{tree?.name ?? run.tree_id}</h1><RunStatusBadge status={run.status === "queued" ? "pending" : run.status} />{run.final_status ? <span className={`text-sm font-semibold ${run.final_status === "partial" ? "text-warning" : run.final_status === "failed" ? "text-destructive" : ""}`}>{t("liveV2.finalStatus")}: {t(`liveV2.finalState.${run.final_status}`)}</span> : null}</div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{t("liveV2.version")}: {tree?.version.id === run.tree_version_id ? `v${tree.version.version_number}` : run.tree_version_id.slice(0, 8)}</span><span className="break-all">{t("liveV2.runId")}: {run.run_id}</span><span>{t("liveV2.created")}: {new Date(run.created_at).toLocaleString(i18n.language)}</span><span>{t("liveV2.started")}: {run.started_at ? new Date(run.started_at).toLocaleString(i18n.language) : "—"}</span><span>{t("liveV2.elapsed")}: {elapsed}s</span>{run.finished_at ? <span>{t("liveV2.finished")}: {new Date(run.finished_at).toLocaleString(i18n.language)}</span> : null}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><span role="status" className="text-sm">{t("liveV2.connection")}: {t(`liveV2.connectionState.${connection}`)}</span><Button variant="outline" onClick={() => void navigator.clipboard?.writeText(run.run_id)}><Copy className="size-4" />{t("liveV2.copyId")}</Button>{active && run.status !== "cancellation_requested" ? <Button variant="outline" disabled={cancelling} onClick={() => void cancel()}><XCircle className="size-4" />{t("liveV2.cancel")}</Button> : null}</div>
      {run.status === "queued" ? <p className="mt-3 text-sm text-muted-foreground">{t("liveV2.queued")}</p> : null}
      {run.status === "cancellation_requested" ? <p className="mt-3 text-sm text-warning">{t("liveV2.cancellationRequested")}</p> : null}
      {active && connection === "reconnecting" ? <p className="mt-3 text-sm text-warning">{t("liveV2.reconnectingHelp")}</p> : null}
      {run.status === "failed" && run.error ? <p role="alert" className="mt-3 text-sm text-destructive">{run.error.code}: {run.error.message}</p> : null}
      {run.status === "cancelled" ? <p className="mt-3 text-sm">{t("liveV2.cancelled")}</p> : null}
      {run.final_status === "partial" ? <p className="mt-3 text-sm text-warning">{t("liveV2.partialHelp")}</p> : null}
    </header>
    <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)]"><RunTimeline model={model} tree={tree} versionId={run.tree_version_id} /><RunArtifacts runId={run.run_id} artifacts={artifacts} /></div>
    <section className="border-t border-border pt-5" aria-live="polite"><h2 className="text-xl font-semibold">{t("liveV2.finalOutput")}</h2>{run.final_output !== null ? <pre className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{outputText(run.final_output)}</pre> : rootText && active ? <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{rootText}</pre> : <p className="mt-3 text-sm text-muted-foreground">{t("liveV2.outputPending")}</p>}</section>
    {legacy && model.events.length === 0 ? <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">{t("liveV2.legacyTrace")}</summary><ExecutionInspector run={legacy} tree={tree} /></details> : null}
    <details className="border-t border-border pt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("liveV2.durability")}</summary><p className="mt-2">{t("liveV2.durabilityHelp")}</p></details>
  </div>
}
