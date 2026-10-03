import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import i18n from "@/i18n"
import { RunRecoveryNotice, RunStatusBadge } from "@/components/run-status-badge"
import { hasStructuredRepair, recoveredAttempts, runPresentation } from "@/lib/run-presentation"
import type { LiveEvent } from "@/lib/api"

const event = (type: string): LiveEvent => ({ type, sequence: 1, agent_id: "root", agent_name: "Root", payload: {}, created_at: "2026-10-03T00:00:00Z" })
beforeEach(async () => { await i18n.changeLanguage("en") })

describe("Run presentation", () => {
  it.each([
    ["completed", "partial", "partial", "warning"],
    ["completed", "completed", "completed", "success"],
    ["completed", "passed", "completed", "success"],
    ["completed", "revision_limit_reached", "revisionLimit", "warning"],
    ["completed", "failed", "failedOutcome", "destructive"],
    ["running", "partial", "running", "info"],
    ["failed", "completed", "failed", "destructive"],
    ["cancelled", "partial", "cancelled", "secondary"],
    ["cancellation_requested", "completed", "cancellation_requested", "warning"],
    ["queued", "partial", "pending", "warning"],
  ] as const)("%s with outcome %s displays %s", (status, final_status, display, variant) => {
    expect(runPresentation({ status, final_status })).toMatchObject({ status: display, variant })
  })
  it("uses legacy and dashboard outcomes while preferring the explicit final outcome", () => {
    expect(runPresentation({ status: "completed", output: { core_status: "partial" } }).status).toBe("partial")
    expect(runPresentation({ status: "completed", result_state: "partial" }).status).toBe("partial")
    expect(runPresentation({ status: "completed", final_status: "completed", output: { core_status: "partial" } }).status).toBe("completed")
    expect(runPresentation({ status: "completed", result_state: "PROVIDER_RATE_LIMIT" }).status).toBe("completed")
    expect(runPresentation({ status: "completed" }).status).toBe("completed")
  })
  it.each([['en', 'Partial'], ['th', 'ผลลัพธ์บางส่วน']])("localizes the primary partial badge in %s without a competing success badge", async (language, label) => {
    await i18n.changeLanguage(language)
    render(<RunStatusBadge status="completed" final_status="partial" />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(language === "en" ? "Completed" : "สำเร็จ")).not.toBeInTheDocument()
  })
  it("keeps explicit repair evidence as a notice alongside terminal failure", () => {
    const events = [event("structured_decision.validation_failed"), event("structured_decision.repair.succeeded")]
    render(<><RunStatusBadge status="failed" final_status="failed" /><RunRecoveryNotice events={events} /></>)
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("integrationPolish.recoveryNotice"))
    expect(events).toHaveLength(2)
  })
  it("never infers repair or Tool recovery from failed attempts", () => {
    const events = [event("structured_decision.repair.failed"), event("orchestration.tool_execution_failed"), event("operation.committed")]
    expect(hasStructuredRepair(events)).toBe(false)
    render(<RunRecoveryNotice events={events} />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
  it("requires a later successful call to the same Tool by the same Agent", () => {
    const failure = { ...event("specialist.tool.failed"), sequence: 2, payload: { metadata: { tool_id: "tool-a" } } }
    const unrelated = { ...event("specialist.tool.completed"), sequence: 3, agent_id: "other", payload: { metadata: { tool_id: "tool-a" } } }
    const otherTool = { ...event("specialist.tool.completed"), sequence: 4, payload: { metadata: { tool_id: "tool-b" } } }
    expect(recoveredAttempts([failure, unrelated, otherTool]).size).toBe(0)
    const success = { ...event("specialist.tool.completed"), sequence: 5, payload: { metadata: { tool_id: "tool-a" } } }
    expect([...recoveredAttempts([success, failure, unrelated, otherTool])]).toEqual([2])
    render(<RunRecoveryNotice events={[failure, success]} />)
    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("integrationPolish.recoveredToolNotice"))
  })
  it("does not call a failed decision recovered without matching phase identity", () => {
    const failure = { ...event("structured_decision.validation_failed"), sequence: 1, payload: { metadata: { phase: "root.triage" } } }
    const success = { ...event("structured_decision.repair.succeeded"), sequence: 2, payload: { metadata: { phase: "manager.review" } } }
    expect(recoveredAttempts([failure, success]).size).toBe(0)
    expect([...recoveredAttempts([failure, { ...success, payload: { metadata: { phase: "root.triage" } } }])]).toEqual([1])
  })
})
