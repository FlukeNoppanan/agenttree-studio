import type { TraceEvent, TreeDetail } from "@/lib/api"

export interface TraceActivity {
  event: TraceEvent
  key: string
  stage: string
  actor: string | null
  role: string | null
  context: Array<[string, string]>
  outcome: "activity" | "success" | "warning" | "error"
}
const known: Record<string, [string, string]> = {
  "studio.tool_decision": ["toolRequested", "resource"],
  "studio.tool_observation": ["toolCompleted", "resource"],
  "execution.queued": ["queued", "execution"],
  "execution.started": ["started", "execution"],
  "execution.completed": ["completed", "execution"],
  "execution.failed": ["failed", "execution"],
  "execution.cancelled": ["cancelled", "execution"],
  "execution.cancellation_requested": ["cancelRequested", "execution"],
  "root.planning.started": ["rootPlanning", "planning"],
  "root.planning.completed": ["rootPlanned", "planning"],
  "root.direct_response": ["direct", "planning"],
  "root.synthesis.started": ["synthesis", "synthesis"],
  "root.synthesis.completed": ["synthesized", "synthesis"],
  "root.synthesis.failed": ["synthesisFailed", "synthesis"],
  "orchestration.started": ["received", "planning"],
  "orchestration.triage_completed": ["routed", "planning"],
  "orchestration.manager_discovery_completed": ["managers", "planning"],
  "orchestration.no_manager": ["noManager", "planning"],
  "orchestration.planning_completed": ["planned", "planning"],
  "orchestration.manager_delegation_started": ["decomposing", "delegation"],
  "orchestration.subtask_created": ["subtask", "delegation"],
  "orchestration.specialist_discovery_completed": ["specialistSelected", "delegation"],
  "orchestration.no_specialist": ["noSpecialist", "delegation"],
  "orchestration.manager_delegation_completed": ["delegated", "delegation"],
  "orchestration.execution_started": ["workStarted", "work"],
  "orchestration.specialist_execution_started": ["specialistStarted", "work"],
  "orchestration.specialist_execution_completed": ["specialistCompleted", "work"],
  "orchestration.specialist_execution_failed": ["specialistFailed", "work"],
  "orchestration.assignment_skipped": ["skipped", "work"],
  "orchestration.execution_completed": ["workCompleted", "work"],
  "orchestration.manager_review_started": ["managerReview", "managerReview"],
  "orchestration.manager_review_passed": ["managerPass", "managerReview"],
  "orchestration.manager_review_failed": ["managerFail", "managerReview"],
  "orchestration.manager_review_completed": ["managerReturned", "managerReview"],
  "orchestration.manager_review_revision_requested": ["managerRevise", "managerReview"],
  "orchestration.revision_started": ["revision", "managerReview"],
  "orchestration.revision_execution_completed": ["revised", "managerReview"],
  "orchestration.revision_limit_reached": ["managerLimit", "managerReview"],
  "orchestration.final_review_started": ["rootReview", "rootReview"],
  "orchestration.final_review_passed": ["rootPass", "rootReview"],
  "orchestration.final_review_failed": ["rootFail", "rootReview"],
  "orchestration.final_review_revision_requested": ["rootRevise", "rootReview"],
  "orchestration.final_revision_started": ["reconsider", "rootReview"],
  "orchestration.final_revision_completed": ["reconsidered", "rootReview"],
  "orchestration.final_revision_limit_reached": ["rootLimit", "rootReview"],
  // This precedes Root synthesis. Do not call it the finished user-facing answer.
  "orchestration.final_result_created": ["finalized", "rootReview"],
  "artifact.staged": ["artifactStaged", "resource"],
  "artifact.committed": ["artifactCommitted", "resource"],
  "output.final.available": ["output", "synthesis"],
}
const infrastructure = /^(operation\.(prepared|in_flight|committed|reused)|execution\.(checkpoint\.saved|phase\.(started|completed))|structured_decision\.decision_attempt)$/
function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}
export function traceMetadata(event: TraceEvent): Record<string, unknown> {
  const value = event.payload.metadata
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function traceActivities(events: TraceEvent[], tree?: TreeDetail | null): TraceActivity[] {
  const agents = new Map(tree?.version.agents.map(agent => [agent.id, agent]) ?? [])
  const seen = new Set<string>()
  const output: TraceActivity[] = []
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
  // Studio/Core/legacy adapters can journal the same lifecycle transition.
  // Show one representative per transition; TechnicalTrace retains every row.
  const lifecycle = new Set(["execution.queued", "execution.started", "execution.completed", "execution.failed", "execution.cancelled"])
  const representatives = new Map<string, TraceEvent>()
  for (const event of ordered) if (lifecycle.has(event.event_type) && (!representatives.has(event.event_type) || (!representatives.get(event.event_type)?.agent_id && event.agent_id))) representatives.set(event.event_type, event)
  for (const event of ordered) {
    if (lifecycle.has(event.event_type) && representatives.get(event.event_type) !== event) continue
    if (infrastructure.test(event.event_type)) continue
    const fingerprint = JSON.stringify([event.event_type, event.agent_id, event.payload, event.created_at])
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    const meta = traceMetadata(event)
    let [key, stage] = known[event.event_type] ?? ["other", "execution"]
    if (event.event_type.includes("tool") && /started|completed|failed|denied|requested|authorized/.test(event.event_type)) {
      key = event.event_type.endsWith("failed") || event.event_type.endsWith("denied") ? "toolFailed" : event.event_type.endsWith("completed") ? "toolCompleted" : event.event_type.endsWith("started") ? "toolStarted" : "toolRequested"
      stage = "resource"
    } else if (/collaboration|peer|message/.test(event.event_type)) {
      key = "collaboration"; stage = "collaboration"
    } else if (/repair|retry|uncertain|recovery/.test(event.event_type)) {
      key = event.event_type.endsWith("succeeded") ? "recovered" : "retry"; stage = "recovery"
    }
    const agent = event.agent_id ? agents.get(event.agent_id) : undefined
    const role = agent?.agent_type ?? (/^root\.|orchestration\.final_/.test(event.event_type) ? "root" : /^orchestration\.manager_/.test(event.event_type) ? "manager" : /^orchestration\.specialist_execution_/.test(event.event_type) ? "specialist" : null)
    const context: Array<[string, string]> = []
    const add = (label: string, value: unknown) => { const text = scalar(value); if (text) context.push([label, text]) }
    const resolve = (value: unknown) => scalar(value) ? agents.get(String(value))?.name ?? String(value) : null
    add("task", meta.subtask_id)
    add("objective", meta.objective ?? meta.subtask_objective)
    add("manager", resolve(meta.manager_id))
    add("specialist", resolve(meta.specialist_id ?? meta.selected_specialist_id))
    add("tool", meta.tool_name ?? meta.tool_id)
    add("provider", meta.provider)
    add("model", meta.model)
    add("duration", meta.duration_ms)
    add("review", meta.review_number)
    add("revision", meta.requested_revision_number ?? meta.revision_number)
    add("outcome", meta.status)
    add("feedback", meta.feedback)
    if (Array.isArray(meta.required_capabilities)) add("capability", meta.required_capabilities.filter(v => typeof v === "string").join(", "))
    if (Array.isArray(meta.selected_manager_ids)) add("manager", meta.selected_manager_ids.map(resolve).filter(Boolean).join(", "))
    const outcome = /failed|denied|no_manager|no_specialist/.test(event.event_type) ? "error" : /revision_requested|limit_reached|cancel|retry|skipped/.test(event.event_type) ? "warning" : /passed|completed|committed|succeeded|available/.test(event.event_type) ? "success" : "activity"
    output.push({ event, key, stage, role, actor: event.agent_name ?? agent?.name ?? event.agent_id, context, outcome })
  }
  return output
}
