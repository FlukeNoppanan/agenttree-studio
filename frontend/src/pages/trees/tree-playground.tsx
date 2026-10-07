import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Play, RotateCcw, Square, ArrowUpRight, Zap, Layers3 } from 'lucide-react'
import { useAuth } from '@/auth'
import { api, type ExecutionMode, type TreeDetail, type ValidationIssue, type TreeValidation, type TreeVersion, type Run, type ProviderConnection, type ToolConnection } from '@/lib/api'
import { runPresentation } from '@/lib/run-presentation'
import { projectJournal, inputText, isTerminal, operationInfo, waitingProviderRequests } from '@/lib/playground-execution'
import { usePlaygroundRun } from '@/lib/use-playground-run'
import { BuilderCanvas } from '@/components/tree/builder/canvas'
import { autoLayout, treeDocument } from '@/components/tree/builder/model'
import { PlaygroundResult } from '@/components/playground-result'
import { RunArtifacts } from '@/components/live/run-artifacts'
import { RunStatusBadge, RunRecoveryNotice } from '@/components/run-status-badge'
import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import './tree-playground.css'

const noop = () => {}
const noIssues: ValidationIssue[] = []
export function TreePlaygroundPage() {
  const { treeId = '' } = useParams(), navigate = useNavigate(), [params, setParams] = useSearchParams()
  const runId = params.get('run'), { can } = useAuth(), { t, i18n } = useTranslation()
  const [tree, setTree] = useState<TreeDetail | null>(null), [validation, setValidation] = useState<TreeValidation | null>(null)
  const [providers, setProviders] = useState<ProviderConnection[]>([]), [tools, setTools] = useState<ToolConnection[]>([])
  const [version, setVersion] = useState<TreeVersion | null>(null), [history, setHistory] = useState<Run[]>([])
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('fast')
  const [input, setInput] = useState(''), [format, setFormat] = useState('text'), [raw, setRaw] = useState(false)
  const [submitting, setSubmitting] = useState(false), [cancelling, setCancelling] = useState(false), [error, setError] = useState<string | null>(null)
  const [fit, setFit] = useState(0), [clock, setClock] = useState(Date.now())
  const live = usePlaygroundRun(runId, treeId), active = Boolean(runId && (!live.run || !isTerminal(live.run.status)))
  useEffect(() => {
    let mounted = true
    setTree(null); setValidation(null); setHistory([]); setVersion(null); setError(null); setInput(''); setExecutionMode('fast')
    void Promise.all([api.getTree(treeId), api.validateTree(treeId), api.listTreeRuns(treeId)]).then(([next, ready, runs]) => {
      if (mounted) { setTree(next); setValidation(ready); setHistory(runs) }
    }).catch(caught => { if (mounted) setError(caught instanceof Error ? caught.message : t('playground.loadFailed')) })
    if (can('manage_providers_models')) void api.listProviders().then(result => { if (mounted) setProviders(result) }).catch(noop)
    if (can('manage_tools_mcp')) void api.listTools().then(result => { if (mounted) setTools(result) }).catch(noop)
    return () => { mounted = false }
    // Account permissions are stable for this mounted route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId])
  useEffect(() => {
    let mounted = true
    setVersion(null)
    if (tree && live.run && live.run.tree_version_id !== tree.current_version_id) {
      void api.getTreeVersion(treeId, live.run.tree_version_id).then(next => { if (mounted) setVersion(next) }).catch(caught => { if (mounted) setError(caught instanceof Error ? caught.message : t('playground.loadFailed')) })
    }
    return () => { mounted = false }
  }, [tree, live.run?.tree_version_id, treeId, t])
  useEffect(() => { if (live.detail) setInput(inputText(live.detail.input)) }, [live.detail?.id])
  useEffect(() => { if (live.run) setExecutionMode(live.run.execution_mode ?? 'fast') }, [live.run?.run_id, live.run?.execution_mode])
  useEffect(() => { if (live.run && isTerminal(live.run.status)) void api.listTreeRuns(treeId).then(setHistory).catch(noop) }, [live.run?.status, treeId])
  useEffect(() => { if (!active) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [active])
  const pinnedTree = tree && !(runId && !live.run) ? (!live.run || live.run.tree_version_id === tree.current_version_id ? tree : version ? { ...tree, version, current_version_id: version.id } : null) : null
  const snapshot = useMemo(() => { if (!pinnedTree) return null; const document = treeDocument(pinnedTree); return { document, positions: Object.fromEntries(Object.entries(autoLayout(document)).map(([id, point]) => [id, { ...point, y: point.y * .82 + (id.startsWith('resource:') ? 50 : 0) }])), collapsed: [] } }, [tree, version, runId, live.run?.tree_version_id])
  const projection = useMemo(() => projectJournal(snapshot?.document.agents ?? [], live.journal, live.run?.status), [snapshot, live.journal.states, live.journal.phases, live.run?.status])
  const ready = Boolean(validation?.valid && tree && tree.status === 'ready' && tree.version.status === 'ready')
  const readinessLabel = ready ? 'playground.ready' : validation?.valid && tree?.status === 'draft' ? 'playground.validDraft' : 'playground.notReady'
  const start = async () => {
    if (!tree || !input.trim() || submitting || active || !can('use_trees')) return
    setSubmitting(true); setError(null)
    try {
      let payload = input.trim()
      if (format === 'json') { try { payload = JSON.stringify(JSON.parse(payload)) } catch { throw new Error(t('playground.invalidJson')) } }
      const authoritative = await api.validateTree(treeId); setValidation(authoritative)
      if (!authoritative.valid || !ready) return
      const accepted = await api.submitLiveRun(treeId, payload, executionMode)
      setParams({ run: accepted.run_id }); setRaw(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('playground.loadFailed')) }
    finally { setSubmitting(false) }
  }
  const cancel = async () => {
    if (!runId || cancelling) return
    setCancelling(true)
    try { await api.cancelLiveRun(runId); await live.refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : t('playground.loadFailed')) }
    finally { setCancelling(false) }
  }
  const result = live.run?.final_output
  const trafficWaiting = active && waitingProviderRequests(live.model.events).length > 0
  const elapsed = live.run?.started_at ? Math.max(0, (new Date(live.run.finished_at ?? clock).getTime() - new Date(live.run.started_at).getTime()) / 1000) : 0
  const timeline = live.model.events.filter(event => event.type.startsWith('provider.') || ['execution.queued', 'execution.started', 'execution.completed', 'execution.failed', 'execution.cancelled'].includes(event.type) || ['operation.in_flight', 'operation.committed', 'operation.failed'].includes(event.type)).slice(-60)
  if (live.lostAccess) return <Notice tone="error" message={t('playground.accessLost')} onDismiss={noop} />
  if (!tree) return error ? <Notice tone="error" message={error} onDismiss={noop} /> : <Skeleton className="h-96" />
  return <div className="playground-page builder-page">
    <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4"><Button variant="ghost" size="icon" aria-label={t('playground.build')} onClick={() => navigate(`/trees/${treeId}/build`)}><ArrowLeft size={18} /></Button><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Playground</p><h1 className="mt-1 text-2xl font-semibold">{tree.name}</h1></div><span className={ready ? 'text-success text-sm' : 'text-warning text-sm'}>{t(readinessLabel)}</span><Button variant="outline" onClick={() => navigate(`/trees/${treeId}/build`)}>{t('playground.build')}</Button></header>
    {error || live.error ? <Notice tone="error" message={error ?? live.error!} onDismiss={() => setError(null)} /> : null}
    {!ready && validation && <section className="playground-blockers"><h2 className="font-semibold">{t(readinessLabel)}</h2><p className="mt-1 text-sm text-muted-foreground">{t(validation.valid ? 'playground.markReadyHelp' : 'playground.blockerHelp')}</p><ul className="mt-3 space-y-2 text-sm">{validation.errors.map((issue, index) => <li key={index}><button className="text-left hover:text-primary" onClick={() => navigate(`/trees/${treeId}/build${issue.agent_id ? `?agent=${issue.agent_id}` : ''}`)}>{t(`builder.issue.${issue.code}`, { defaultValue: issue.message })}{issue.agent_id && ` · ${tree.version.agents.find(a => a.id === issue.agent_id)?.name ?? issue.agent_id}`}</button></li>)}</ul><Button variant="outline" className="mt-3" onClick={() => navigate(`/trees/${treeId}/build`)}>{t('playground.build')}</Button></section>}
    <div className="playground-workspace">
      <section className="playground-test" aria-label={t('playground.test')}>
        <div><h2 className="text-lg font-semibold">{t('playground.test')}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t('playground.introduction')}</p></div>
        {history.length > 0 && <label className="block text-xs text-muted-foreground">{t('playground.history')}<select aria-label={t('playground.history')} className="mt-2 w-full rounded-lg border border-border bg-input p-2 text-sm text-foreground" value={runId ?? ''} disabled={submitting} onChange={event => setParams(event.target.value ? { run: event.target.value } : {})}><option value="">{t('playground.newTest')}</option>{history.slice(0, 50).map(item => <option key={item.id} value={item.id}>#{item.id.slice(0, 8)} · {t(`status.${item.status}`)} · {new Date(item.started_at).toLocaleString(i18n.language)}</option>)}{runId && !history.some(item => item.id === runId) && <option value={runId}>#{runId.slice(0, 8)}</option>}</select></label>}
        {live.detail && <article className="playground-message"><p className="mb-2 text-xs font-semibold text-primary">{t('playground.submitted')}</p><p className="whitespace-pre-wrap break-words text-sm">{inputText(live.detail.input)}</p></article>}
        {active && <div role="status" className="playground-message"><p className="font-medium">{t(live.run?.status === 'cancellation_requested' ? 'playground.cancellationRequested' : 'playground.working')}</p><p className="mt-1 text-xs text-muted-foreground">{t(`liveV2.connectionState.${live.connection}`, { defaultValue: live.connection })}</p>{Object.entries(live.model.text).filter(([key]) => key.startsWith('root:')).map(([key, text]) => <div key={key} className="mt-3"><p className="text-xs text-muted-foreground">{t('playground.preliminary')}</p><pre className="mt-2 whitespace-pre-wrap break-words text-sm">{text}</pre></div>)}{live.model.dropped > 0 && <p className="text-xs text-warning">{t('playground.dropped')}</p>}</div>}
        {isTerminal(live.run?.status) && <article className="playground-result" aria-label={t('playground.result')}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t('playground.result')}</h2><button className="rounded px-2 py-1 text-xs text-primary focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={raw} onClick={() => setRaw(value => !value)}>{t(raw ? 'playground.formatted' : 'playground.raw')}</button></div>{live.run?.error && <p role="alert" className="mt-3 text-sm text-destructive">{live.run.error.message}</p>}{result != null ? <PlaygroundResult value={result} raw={raw} /> : <p className="mt-3 text-sm text-muted-foreground">{t('playground.noResult')}</p>}{live.run && runPresentation(live.run).status === 'partial' && <p className="mt-4 text-sm text-warning">{t('integrationPolish.partialResult')}</p>}{live.run && runPresentation(live.run).status === 'completed' && <p className="mt-4 text-sm text-success">{t('playground.success')}</p>}<RunRecoveryNotice events={live.model.events} />{runId && live.artifacts.length > 0 && <RunArtifacts runId={runId} artifacts={live.artifacts} />}</article>}
        <form onSubmit={event => { event.preventDefault(); void start() }} className="mt-auto space-y-3"><div className="flex items-center justify-between"><label htmlFor="playground-input" className="text-sm font-medium">{t('playground.input')}</label><select aria-label={t('playground.inputFormat')} className="rounded border border-border bg-input px-2 py-1 text-xs" value={format} onChange={event => setFormat(event.target.value)}><option value="text">{t('playground.text')}</option><option value="json">JSON</option></select></div><fieldset disabled={active || submitting} className="space-y-2"><legend className="mb-2 text-xs font-medium">{t('playground.executionMode')}</legend><div className="flex gap-2">{(['fast', 'deep'] as const).map(mode => { const Icon = mode === 'fast' ? Zap : Layers3; return <Button key={mode} type="button" size="sm" variant={executionMode === mode ? 'default' : 'outline'} aria-pressed={executionMode === mode} onClick={() => setExecutionMode(mode)}><Icon size={14} />{t(`playground.modes.${mode}`)}</Button> })}</div><p className="text-xs leading-5 text-muted-foreground">{t(`playground.modeHelp.${executionMode}`)}</p></fieldset><Textarea id="playground-input" rows={5} maxLength={65536} value={input} disabled={active} onChange={event => setInput(event.target.value)} placeholder={t('playground.placeholder')} /><p className="text-xs leading-5 text-muted-foreground">{t('playground.independent')}</p>{!can('use_trees') && <p className="text-sm text-warning">{t('playground.noPermission')}</p>}<div className="flex flex-wrap gap-2">{active ? <Button type="button" variant="outline" disabled={cancelling || !live.run || live.run.status === 'cancellation_requested'} onClick={() => void cancel()}><Square size={14} />{t('playground.cancel')}</Button> : <Button type="submit" disabled={!ready || !input.trim() || submitting || !can('use_trees')}><Play size={15} />{t(submitting ? 'playground.starting' : 'playground.run')}</Button>}{runId && !active && <Button type="button" variant="outline" onClick={() => { setParams({}); document.getElementById('playground-input')?.focus() }}><RotateCcw size={14} />{t('playground.again')}</Button>}</div></form>
      </section>
      <section className="playground-live" aria-label={t('playground.live')}><div className="playground-graph-header"><div><h2 className="font-semibold">{t('playground.live')}</h2><p className="text-xs text-muted-foreground">{t(runId ? 'playground.pinned' : 'playground.graphHelp')}</p></div><Button size="sm" variant="ghost" onClick={() => setFit(value => value + 1)}>{t('builder.fit')}</Button></div>
        <div className="playground-graph">{snapshot ? <BuilderCanvas key={pinnedTree?.version.id} readOnly snapshot={snapshot} tools={tools} providers={providers} issues={runId ? noIssues : validation?.errors ?? noIssues} checked executionByAgentId={projection.states} executionPhases={projection.phases} pulseTarget={live.pulseTarget} onPositions={noop} onConnect={noop} onDisconnectResource={noop} onDrop={noop} onInspect={noop} onCollapse={noop} onReject={noop} onSelection={noop} fitToken={fit} /> : <Skeleton className="h-full" />}</div>
        {trafficWaiting && <p role="status" className="px-4 py-2 text-sm text-warning">{t("playground.trafficWaiting")}</p>}
        <div className="playground-legend">{['idle', 'queued', 'running', 'completed', 'failed', 'cancelled'].map(state => <span key={state} data-state={state}>{t(`playground.states.${state}`)}</span>)}</div>
      </section>
      <section className="playground-activity" aria-label={t('playground.timeline')}><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('playground.timeline')}</h3>{timeline.length ? <ol className="space-y-2">{timeline.map(event => { const meta = operationInfo(event), phase = typeof meta.operation_type === 'string' ? meta.operation_type : ''; return <li key={event.sequence} className="flex gap-3 text-xs"><time className="shrink-0 tabular-nums text-muted-foreground">{new Date(event.created_at).toLocaleTimeString(i18n.language)}</time><span className="min-w-0 break-words">{event.agent_name && <strong>{event.agent_name} · </strong>}{phase ? t(`playground.phases.${phase.replaceAll('.', '_')}`, { defaultValue: phase }) : t(`playground.events.${event.type.replaceAll('.', '_')}`, { defaultValue: event.type })}{phase && ` · ${t(event.type === 'operation.in_flight' ? 'playground.states.running' : event.type === 'operation.failed' ? 'playground.states.failed' : 'playground.states.completed')}`}{typeof meta.attempt === 'number' && meta.attempt > 1 && ` (${meta.attempt})`}</span></li> })}</ol> : <p className="text-sm text-muted-foreground">{t('playground.timelineEmpty')}</p>}</section>
    </div>
    {runId && <footer className="playground-footer"><div className="min-w-0"><p className="break-all font-mono text-xs" data-testid="playground-run-id">{runId}</p><div className="mt-2 flex items-center gap-3">{live.run && <RunStatusBadge {...live.run} />}<span className="text-xs font-medium">{t(`playground.modes.${live.run?.execution_mode ?? executionMode}`)}</span><span className="text-xs text-muted-foreground">{elapsed.toFixed(1)}s · {live.model.events.length} {t('playground.eventsCount')}</span></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate(`/executions/${runId}?trace=1`)}>{t('playground.trace')}<ArrowUpRight size={14} /></Button><Button variant="ghost" onClick={() => navigate(`/executions/${runId}`)}>{t('consolidation.viewExecution')}</Button>{live.run?.status === 'completed' && <Button onClick={() => navigate(`/trees/${treeId}?tab=connect`)}>{t('playground.connect')}</Button>}</div></footer>}
  </div>
}
