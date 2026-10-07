import type { ProviderModel } from "@/lib/api"

/** A catalog entry is not evidence that a model can generate for AgentTree. */
export function isUsableModel(model: ProviderModel): boolean {
  return model.is_available && model.generation_candidate && model.qualification_status === "qualified"
}

/** Expert use remains possible when generation passed but decisions did not. */
export function isSelectableModel(model: ProviderModel): boolean {
  return model.is_available && model.generation_candidate && ["qualified", "limited"].includes(model.qualification_status)
}

export function modelCompatibilityKey(model: ProviderModel): string {
  return `compatibility.${model.qualification_status}`
}

export interface QualificationEvidence {
  version: number
  generation: string
  checks: Record<string, { status: string; reason_code?: string; field?: string; diagnostics?: {
    requests: Array<{ request_mode: string; response_received?: boolean; final_content_present?: boolean; reasoning_present?: boolean }>
    representation?: string | null; validation: string; repair_attempted: boolean; repair_result: string
  } }>
  roles: Record<string, string>
  tool_calling: string
}
export function supportsAgentRole(model: ProviderModel, role: "root" | "manager" | "specialist"): boolean {
  if (!isSelectableModel(model)) return false
  const evidence = qualificationEvidence(model)
  if (!evidence) return role === "specialist"
  const requirements = { root: ["structured_output", "root_planning", "triage", "final_review"],
    manager: ["structured_output", "decomposition", "manager_review"], specialist: [] }
  return evidence.generation === "passed" && requirements[role].every(name => evidence.checks[name]?.status === "passed")
}
export function qualificationEvidence(model: ProviderModel): QualificationEvidence | null {
  const value = model.metadata?.agenttree_qualification
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
    || !("checks" in value) || !value.checks || typeof value.checks !== "object" || Array.isArray(value.checks)
    || !("roles" in value) || !value.roles || typeof value.roles !== "object" || Array.isArray(value.roles)
    || !("generation" in value) || typeof value.generation !== "string"
    || !("tool_calling" in value) || typeof value.tool_calling !== "string") return null
  const checks = Object.values(value.checks)
  if (checks.some(check => !check || typeof check !== "object" || !("status" in check) || !["passed", "failed", "interrupted"].includes(String(check.status)))) return null
  return value as QualificationEvidence
}

export interface QualificationAttempt { status?: string; scope?: string; reason_code?: string; retry_at?: string }
export function qualificationAttempt(model: ProviderModel): QualificationAttempt {
  const value = model.metadata?.qualification_attempt
  return value && typeof value === "object" ? value as QualificationAttempt : {}
}
export function isProviderVerificationBlocked(model: ProviderModel): boolean {
  const attempt = qualificationAttempt(model)
  return attempt.status === "pending" && attempt.scope !== "model" || model.qualification_status === "transient_error" &&
    ["provider_rate_limited", "provider_auth_failed", "provider_unavailable", "verification_timeout", "generation_failed"].includes(model.qualification_error_code ?? "") && attempt.scope !== "model"
}
export function needsQualification(model: ProviderModel): boolean {
  if (!model.is_available || !model.generation_candidate || model.qualification_status === "verifying") return false
  const attempt = qualificationAttempt(model)
  if (attempt.retry_at && Date.parse(attempt.retry_at) > Date.now()) return false
  return ["unknown", "transient_error"].includes(model.qualification_status) || attempt.status === "pending" ||
    !model.qualification_checked_at || Date.now() - Date.parse(model.qualification_checked_at) >= 86400000
}
export function qualificationCounts(models: ProviderModel[]) {
  const available = models.filter(m => m.is_available), candidates = available.filter(m => m.generation_candidate)
  return { total:candidates.length, checked:candidates.filter(m => ["qualified", "limited", "unavailable"].includes(m.qualification_status)).length,
    ready:available.filter(isUsableModel).length, limited:available.filter(m => m.qualification_status === "limited").length,
    unavailable:available.filter(m => m.qualification_status === "unavailable").length,
    pending:candidates.filter(m => ["unknown", "transient_error", "verifying"].includes(m.qualification_status)).length,
    rechecks:candidates.filter(m => ["qualified", "limited"].includes(m.qualification_status) && qualificationAttempt(m).status === "pending").length }
}
