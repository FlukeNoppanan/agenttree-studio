import { describe, expect, it } from "vitest"
import { supportsAgentRole } from "./provider-models"
import type { ProviderModel } from "./api"

const model = (status: ProviderModel["qualification_status"], checks: Record<string, {status: string}>): ProviderModel => ({
  id: "test", provider_connection_id: "provider", model_id: "native", display_name: null,
  qualification_checked_at: null, qualification_error_code: null, qualification_message: null,
  discovered_at: "2026-10-07T00:00:00Z",
  is_available: true, generation_candidate: true, qualification_status: status,
  metadata: {agenttree_qualification: {version: 1, generation: "passed", tool_calling: "not_tested",
    roles: {root: "passed", manager: "passed", specialist: "passed"}, checks}},
})

describe("role requirements follow check evidence", () => {
  const passed = Object.fromEntries(["structured_output", "root_planning", "triage", "decomposition", "manager_review", "final_review"].map(name => [name, {status: "passed"}]))
  it("allows Limited Specialist, rejects incompatible Manager and retains compatible Root", () => {
    const limited = model("limited", {...passed, decomposition: {status: "failed"}})
    expect(supportsAgentRole(limited, "specialist")).toBe(true)
    expect(supportsAgentRole(limited, "manager")).toBe(false)
    expect(supportsAgentRole(limited, "root")).toBe(true)
  })
  it("does not treat incomplete evidence or Pending as Ready", () => {
    expect(supportsAgentRole(model("qualified", {}), "root")).toBe(false)
    expect(supportsAgentRole(model("transient_error", passed), "specialist")).toBe(false)
  })
})
