import type { AgentDraft, LiveEvent, LiveRunStatus } from './api'
import type { ExecutionState } from '@/components/tree/builder/model'

export const isTerminal = (status?: string) => ['completed', 'failed', 'cancelled'].includes(status ?? '')
export function operationInfo(event: LiveEvent): Record<string, unknown> {
  const metadata = event.payload.metadata
  return metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {}
}
export interface ExecutionJournal {
  cursor: number; states: Record<string, ExecutionState>; phases: Record<string, string>;
  active: Record<string, Record<string, string>>
}
export const emptyExecutionJournal: ExecutionJournal = { cursor: 0, states: {}, phases: {}, active: {} }
/** Fold all replayed activity while retaining only unfinished operations and latest Agent state. */
export function reduceExecution(journal: ExecutionJournal, event: LiveEvent): ExecutionJournal {
  if (event.sequence <= journal.cursor) return journal
  const next = { ...journal, cursor: event.sequence }, id = event.agent_id
  if (!id || !event.type.startsWith('operation.')) return next
  const meta = operationInfo(event), key = meta.operation_key
  if (typeof key !== 'string') return next
  const operations = { ...journal.active[id] }, phase = typeof meta.operation_type === 'string' ? meta.operation_type : ''
  let state = journal.states[id], currentPhase = journal.phases[id]
  if (event.type === 'operation.in_flight') { operations[key] = phase; state = 'running'; currentPhase = phase }
  else if (event.type === 'operation.prepared' && !state) state = 'queued'
  else if (['operation.committed', 'operation.reconciled', 'operation.reused'].includes(event.type)) {
    delete operations[key]; state = Object.keys(operations).length ? 'running' : 'completed'
    currentPhase = Object.values(operations).at(-1) ?? phase
  } else if (['operation.failed', 'operation.cancelled'].includes(event.type)) {
    delete operations[key]; state = event.type === 'operation.failed' ? 'failed' : 'cancelled'
  }
  const active = { ...journal.active }; if (Object.keys(operations).length) active[id] = operations; else delete active[id]
  return { ...next, active, states: state ? { ...journal.states, [id]: state } : journal.states,
    phases: currentPhase ? { ...journal.phases, [id]: currentPhase } : journal.phases }
}
/** Filter through the pinned Tree UUIDs; terminal status only settles observed unfinished work. */
export function projectJournal(agents: AgentDraft[], journal: ExecutionJournal, status?: LiveRunStatus) {
  const known = new Set(agents.map(a => a.id))
  const states: Record<string, ExecutionState> = {}, phases: Record<string, string> = {}
  for (const [id, state] of Object.entries(journal.states)) if (known.has(id)) {
    states[id] = isTerminal(status) && ['running', 'queued'].includes(state)
      ? status === 'cancelled' ? 'cancelled' : status === 'failed' ? 'failed' : 'idle' : state
    // Historical operation names must not look like ongoing work after termination.
    if (!isTerminal(status) && journal.phases[id]) phases[id] = journal.phases[id]
  }
  return { states, phases }
}
export function executionProjection(agents: AgentDraft[], events: LiveEvent[], status?: LiveRunStatus) {
  return projectJournal(agents, events.reduce(reduceExecution, emptyExecutionJournal), status)
}
export function inputText(input: Record<string, unknown>): string {
  return typeof input.input === 'string' ? input.input : JSON.stringify(input, null, 2)
}
export function displayResult(output: unknown): unknown {
  if (typeof output === 'string') { try { return JSON.parse(output) } catch { return output } }
  return output
}
