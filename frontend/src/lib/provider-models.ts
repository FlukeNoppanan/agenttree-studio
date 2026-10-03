import type { ProviderModel } from "@/lib/api"

/** A catalog entry is not evidence that a model can generate for AgentTree. */
export function isUsableModel(model: ProviderModel): boolean {
  return model.is_available && model.generation_candidate && model.qualification_status === "qualified"
}

export function isProviderVerificationBlocked(model: ProviderModel): boolean {
  return model.qualification_status === "transient_error" &&
    ["provider_rate_limited", "provider_auth_failed", "provider_unavailable"].includes(model.qualification_error_code ?? "")
}
