import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExecutionInspector } from "@/components/execution-inspector"
import i18n from "@/i18n"
import { api, type Run, type RunDetail, type TraceEvent, type TreeDetail, type TreeLive } from "@/lib/api"
import { TreeLivePage } from "@/pages/trees/tree-live"

const stamp = "2026-09-24T10:00:00Z"
function run(id: string, status: Run["status"]): Run {
  return { id, tree_id: "tree-1", tree_name: "Coding Assistant", tree_version_id: "v1", tree_version_number: 1,
    status, input: { task: `Task ${id}` }, metadata: {}, invocation_source: "api", output: null,
    error_code: status === "failed" ? "EXECUTION_ERROR" : null, error_message: status === "failed" ? "Provider execution failed" : null,
    started_at: stamp, created_at: stamp, finished_at: null, duration_ms: null }
}
function event(sequence: number, event_type: string, metadata: Record<string, unknown> = {}): TraceEvent {
  return { id: `event-${sequence}`, run_id: "run-a", sequence, event_type, agent_id: "specialist", agent_name: "Backend Specialist", payload: { metadata }, created_at: stamp }
}
const snapshot: TreeLive = { tree_id: "tree-1", tree_name: "Coding Assistant", runtime_status: "unavailable", runtime_started_at: null,
  active_count: 2, queued_count: 1, completed_count: 1, failed_count: 1,
  executions: [run("run-a", "running"), run("run-b", "running"), run("run-c", "pending"), run("run-d", "completed"), run("run-e", "failed")].map((item) => ({ run: item, current_agent: null, current_stage: null, current_tool: null })), recent_activity: [] }

describe("Tree Live View", () => {
  beforeEach(async () => { await i18n.changeLanguage("en"); vi.spyOn(api, "getTreeLive").mockResolvedValue(snapshot) })

  it("shows independent concurrent executions, filters and opens the selected Inspector", async () => {
    render(<MemoryRouter initialEntries={["/trees/tree-1/live"]}><Routes><Route path="/trees/:treeId/live" element={<TreeLivePage />} /><Route path="/executions/:runId" element={<p>Inspector route</p>} /></Routes></MemoryRouter>)
    expect(await screen.findByText("Coding Assistant")).toBeInTheDocument()
    expect(screen.getAllByText("Runtime unavailable").length).toBeGreaterThan(0)
    expect(screen.getByText("Task run-a")).toBeInTheDocument()
    expect(screen.getByText("Task run-b")).toBeInTheDocument()
    expect(screen.getByText("Task run-c")).toBeInTheDocument()
    expect(screen.getByText("Task run-d")).toBeInTheDocument()
    expect(screen.getByText("Task run-e")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Running" }))
    expect(screen.getByText("Task run-a")).toBeInTheDocument()
    expect(screen.getByText("Task run-b")).toBeInTheDocument()
    expect(screen.queryByText("Task run-c")).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "Inspect" })[1])
    expect(screen.getByText("Inspector route")).toBeInTheDocument()
  })

  it("localizes the runtime boundary in Thai", async () => {
    await i18n.changeLanguage("th")
    render(<MemoryRouter initialEntries={["/trees/tree-1/live"]}><Routes><Route path="/trees/:treeId/live" element={<TreeLivePage />} /></Routes></MemoryRouter>)
    expect((await screen.findAllByText("ยังไม่มีสถานะ Runtime")).length).toBeGreaterThan(0)
    expect(screen.getByText("Live View")).toBeInTheDocument()
    expect(screen.queryByText(/live\.(สำเร็จ|ล้มเหลว|Completed|Failed)/)).not.toBeInTheDocument()
    expect(screen.getAllByText("สำเร็จ").length).toBeGreaterThan(0)
    expect(screen.getAllByText("ล้มเหลว").length).toBeGreaterThan(0)
  })

  it("searches executions, reports an empty result, and opens persisted recent activity", async () => {
    vi.mocked(api.getTreeLive).mockResolvedValue({ ...snapshot, recent_activity: [event(1, "studio.tool_observation")] })
    render(<MemoryRouter initialEntries={["/trees/tree-1/live"]}><Routes><Route path="/trees/:treeId/live" element={<TreeLivePage />} /><Route path="/executions/:runId" element={<p>Selected activity inspector</p>} /></Routes></MemoryRouter>)
    await screen.findByText("Coding Assistant")
    const search = screen.getByRole("textbox", { name: "Search executions…" })
    fireEvent.change(search, { target: { value: "Task run-e" } })
    expect(screen.getByText("Task run-e")).toBeInTheDocument()
    expect(screen.queryByText("Task run-a")).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: "no matching execution" } })
    expect(screen.getByText(/No executions match/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Tool Result/ }))
    expect(screen.getByText("Selected activity inspector")).toBeInTheDocument()
  })
})

describe("Execution Inspector", () => {
  beforeEach(async () => { await i18n.changeLanguage("en") })
  const tree = { version: { id: "v1", agents: [
    { id: "root", name: "Root Agent", agent_type: "root" },
    { id: "manager", name: "Development Manager", agent_type: "manager" },
    { id: "specialist", name: "Backend Specialist", agent_type: "specialist" },
  ] } } as TreeDetail

  it("shows input, hierarchy, tool result, review/revision and provider metadata without raw secrets", () => {
    const detail = { ...run("run-a", "completed"), output: { type: "text", delivery_type: "show_in_web", value: "Implemented", success: true, core_status: "completed" }, trace: [
      event(1, "orchestration.started"),
      { ...event(2, "orchestration.manager_review_started"), agent_id: "manager", agent_name: "Development Manager" },
      event(3, "studio.tool_decision", { tool_name: "filesystem.read_file", arguments: { path: "/workspace/main.py" }, provider: "Gemini", model: "gemini-test", secret: "raw-secret-value" }),
      event(4, "studio.tool_observation", { tool_name: "filesystem.read_file", output: { content: "file contents" } }),
      event(5, "orchestration.manager_review_revision_requested", { requested_revision_number: 1, feedback: "Tests failed" }),
      { ...event(6, "orchestration.final_result_created"), agent_id: "root", agent_name: "Root Agent" },
    ], state: { execution_result: { manager_executions: [{ specialist_executions: [{ specialist_id: "specialist", agent_result: { metadata: { provider: "Real provider", model: "model-1" } } }] }] } }, delivery_results: [] } as RunDetail
    render(<ExecutionInspector run={detail} tree={tree} />)
    expect(screen.getByText("Task run-a")).toBeInTheDocument()
    expect(screen.getAllByText("Root Agent").length).toBeGreaterThan(0)
    expect(screen.getByText("Development Manager")).toBeInTheDocument()
    expect(screen.getAllByText("Backend Specialist").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Tool Call").length).toBeGreaterThan(0)
    expect(screen.getByText("Provider: Gemini")).toBeInTheDocument()
    expect(screen.getByText("Model: gemini-test")).toBeInTheDocument()
    expect(screen.getByText("Provider: Real provider")).toBeInTheDocument()
    expect(screen.getByText("Model: model-1")).toBeInTheDocument()
    expect(screen.getByText("Manager Review")).toBeInTheDocument()
    expect(screen.getByText("Manager requested revision")).toBeInTheDocument()
    expect(screen.getByText("Final Result")).toBeInTheDocument()
    expect(screen.queryByText("raw-secret-value")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("View Tool Result"))
    expect(screen.getByText(/file contents/)).toBeInTheDocument()
  })

  it("shows a useful failure without an invented result", () => {
    const detail = { ...run("run-e", "failed"), trace: [], state: null, delivery_results: [] } as RunDetail
    render(<ExecutionInspector run={detail} tree={tree} />)
    expect(screen.getByText("Execution Failed")).toBeInTheDocument()
    expect(screen.getByText("Provider execution failed")).toBeInTheDocument()
    expect(screen.queryByText("Final Result")).not.toBeInTheDocument()
  })
})
