import type { LiveEvent, LiveRunStatus, RunStatus, TraceEvent } from "@/lib/api"

export interface RunPresentationInput {
  status: RunStatus | LiveRunStatus
  final_status?: string | null
  output?: { core_status?: string | null } | null
  result_state?: string | null
}

/** Outcomes refine completed Runs; active, failed and cancelled lifecycle states win. */
export function runPresentation(run: RunPresentationInput) {
  const status = run.status === "queued" ? "pending" : run.status
  const outcome = run.final_status ?? run.output?.core_status ?? run.result_state
  if (status === "completed") {
    if (outcome === "partial") return { status: "partial", key: "integrationPolish.status.partial", variant: "warning" } as const
    if (outcome === "revision_limit_reached") return { status: "revisionLimit", key: "integrationPolish.status.revisionLimit", variant: "warning" } as const
    if (outcome === "failed") return { status: "failedOutcome", key: "integrationPolish.status.failedOutcome", variant: "destructive" } as const
  }
  const variants = { pending: "warning", running: "info", cancellation_requested: "warning", completed: "success", failed: "destructive", cancelled: "secondary" } as const
  return { status, key: status === "pending" ? "live.queued" : `status.${status}`, variant: variants[status] }
}

export function hasStructuredRepair(events: readonly (LiveEvent | TraceEvent)[]) {
  return events.some(event => /^(?:(?:orchestration|studio)\.)?structured_decision\.repair\.succeeded$/.test("type" in event ? event.type : event.event_type))
}

/** A later success must identify the same Agent and Tool/decision phase. */
export function recoveredAttempts(events: readonly (LiveEvent | TraceEvent)[]) {
  const recovered = new Set<number>(), pending = new Map<string, number[]>()
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (!event.agent_id) continue
    const type = "type" in event ? event.type : event.event_type
    const meta = event.payload.metadata as Record<string, unknown> | undefined
    const tool = meta?.tool_id
    const phase = meta?.phase
    const toolEvent = /(?:\.tool\.(?:failed|completed)$|tool_execution_(?:failed|completed)$)/.test(type)
    const decisionEvent = /structured_decision\.(?:validation_failed|repair\.(?:failed|succeeded))$/.test(type)
    const identity = toolEvent && typeof tool === "string" ? `tool:${tool}`
      : decisionEvent && typeof phase === "string" ? `decision:${phase}` : null
    if (!identity) continue
    const key = `${event.agent_id}:${identity}`
    if (/failed$/.test(type)) pending.set(key, [...(pending.get(key) ?? []), event.sequence])
    if (/completed$|succeeded$/.test(type)) {
      for (const sequence of pending.get(key) ?? []) recovered.add(sequence)
      pending.delete(key)
    }
  }
  return recovered
}
