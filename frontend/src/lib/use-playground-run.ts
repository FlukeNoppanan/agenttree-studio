import { useEffect, useRef, useState } from 'react'
import { api, ApiError, type LiveRun, type RunDetail, type LiveArtifact, type LiveEvent } from './api'
import { emptyLiveModel, openRunStream, reduceLive, type LiveModel, type ConnectionState, type AgentDelta } from './run-live'
import { isTerminal, emptyExecutionJournal, reduceExecution, type ExecutionJournal } from './playground-execution'

export function usePlaygroundRun(runId: string | null, treeId: string) {
  const [run, setRun] = useState<LiveRun | null>(null), [detail, setDetail] = useState<RunDetail | null>(null)
  const [model, setModel] = useState<LiveModel>(emptyLiveModel), [artifacts, setArtifacts] = useState<LiveArtifact[]>([])
  const [journal, setJournal] = useState<ExecutionJournal>(emptyExecutionJournal)
  const [connection, setConnection] = useState<ConnectionState>('ended'), [error, setError] = useState<string | null>(null)
  const [lostAccess, setLostAccess] = useState(false), [pulseTarget, setPulseTarget] = useState<string>()
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    setRun(null); setDetail(null); setModel(emptyLiveModel); setJournal(emptyExecutionJournal); setArtifacts([]); setError(null); setLostAccess(false); setPulseTarget(undefined)
    if (!runId) return
    let active = true, denied = false, busy = false, terminalFetched = false, live = emptyLiveModel
    let journal = emptyExecutionJournal
    const ingest = (event: LiveEvent) => { live = reduceLive(live, { event }); journal = reduceExecution(journal, event) }
    let close = () => {}, pulseTimer = 0, batchTimer = 0
    const pending: Array<{ event?: LiveEvent; delta?: AgentDelta }> = []
    const publish = () => { batchTimer = 0; if (!active || denied) return; for (const action of pending.splice(0)) { if (action.event) ingest(action.event); else live = reduceLive(live, action) } setModel(live); setJournal(journal) }
    const enqueue = (action: { event?: LiveEvent; delta?: AgentDelta }) => { pending.push(action); if (!batchTimer) batchTimer = window.setTimeout(publish, 50) }
    const deny = () => { if (!active) return; denied = true; window.clearTimeout(batchTimer); pending.length = 0; live = emptyLiveModel; journal = emptyExecutionJournal; setJournal(journal); close(); setLostAccess(true); setRun(null); setDetail(null); setArtifacts([]); setModel(emptyLiveModel) }
    const refresh = async () => {
      if (!active || denied || busy) return
      busy = true
      try {
        const next = await api.getLiveRun(runId)
        if (!active || denied) return
        if (next.tree_id !== treeId) { deny(); return }
        setRun(next); setError(null)
        if (isTerminal(next.status) && !terminalFetched) {
          close()
          // Durable replay reconciles even if terminal SSE was missed.
          let page
          do { page = await api.getLiveEvents(runId, live.cursor); if (!active || denied) return; for (const event of page.events) ingest(event) } while (page.has_more)
          const [result, stored, files] = await Promise.all([api.getLiveResult(runId), api.getRun(runId), api.getLiveArtifacts(runId)])
          if (!active || denied) return
          setRun({ ...next, final_output: result.final_output, final_status: result.final_status }); setDetail(stored); setArtifacts(files.artifacts); setModel(live); setJournal(journal); setConnection('ended'); setPulseTarget(undefined); terminalFetched = true
        }
      } catch (caught) {
        if (!active) return
        if (caught instanceof ApiError && [401, 403, 404].includes(caught.status)) deny()
        else setError(caught instanceof Error ? caught.message : 'Run unavailable')
      } finally { busy = false }
    }
    refreshRef.current = refresh
    const start = async () => {
      await refresh()
      if (!active || denied || terminalFetched) return
      // Input and pinned version metadata are persisted before execution.
      try { const stored = await api.getRun(runId); if (active && !denied && stored.tree_id === treeId) setDetail(stored) } catch { /* Status polling retains the authoritative access/error check. */ }
      let page
      try {
        do { page = await api.getLiveEvents(runId, live.cursor); if (!active || denied) return; for (const event of page.events) ingest(event) } while (page.has_more)
        setModel(live); setJournal(journal)
      } catch { if (active && !denied) setConnection('reconnecting') }
      if (!active || denied || terminalFetched) return
      close = openRunStream(runId, { cursor: () => live.cursor,
        onEvent: event => {
          if (!active || denied) return
          const fresh = event.sequence > live.cursor && !pending.some(a => a.event?.sequence === event.sequence)
          enqueue({ event })
          if (fresh && event.type === 'operation.in_flight' && event.agent_id && ['manager.decompose', 'specialist.generate', 'specialist.revision'].includes(String((event.payload.metadata as Record<string, unknown> | undefined)?.operation_type))) {
            setPulseTarget(undefined); window.clearTimeout(pulseTimer)
            pulseTimer = window.setTimeout(() => { if (active && !denied) setPulseTarget(event.agent_id!); pulseTimer = window.setTimeout(() => { if (active && !denied) setPulseTarget(undefined) }, 600) }, 20)
          }
          if (event.type.startsWith('execution.') && isTerminal(event.type.split('.').at(-1))) void refresh()
        }, onDelta: delta => { if (active && !denied) enqueue({ delta }) }, onConnection: state => { if (active && !denied) setConnection(state) }, onAuthorizationLost: deny,
      })
    }
    void start()
    const timer = window.setInterval(() => { if (!terminalFetched) void refresh() }, 2000)
    return () => { active = false; close(); window.clearInterval(timer); window.clearTimeout(pulseTimer); window.clearTimeout(batchTimer) }
  }, [runId, treeId])
  return { run, detail, model, journal, artifacts, connection, error, lostAccess, pulseTarget, refresh: () => refreshRef.current() }
}
