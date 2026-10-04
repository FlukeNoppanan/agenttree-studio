import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "@/i18n"
import { api, type LiveArtifact, type LiveRun } from "@/lib/api"
import { openRunStream } from "@/lib/run-live"
import { RunDetailPage } from "@/pages/runs/run-detail"

vi.mock("@/lib/run-live", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/run-live")>()
  return { ...actual, openRunStream: vi.fn() }
})
const stamp = "2026-09-27T00:00:00Z"
const running: LiveRun = { run_id: "run-1", tree_id: "tree-1", tree_version_id: "version-1", status: "running",
  final_status: null, created_at: stamp, started_at: stamp, finished_at: null, cancellation_requested: false,
  error: null, artifact_count: 0, latest_event_sequence: 1, final_output: null }
const artifact: LiveArtifact = { artifact_id: "artifact-1", type: "PATCH", name: "fix.patch", path: "src/fix.patch",
  operation: "modify", media_type: "text/x-diff", size_bytes: 12, sha256: "abcd1234", producer_role: "specialist",
  producer_agent_id: "worker", is_final: false, body_available: true, created_at: stamp }

function mount() { return render(<MemoryRouter initialEntries={["/runs/run-1"]}><Routes><Route path="/runs/:runId" element={<RunDetailPage />} /></Routes></MemoryRouter>) }

describe("Live Run console", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    vi.spyOn(api, "getLiveRun").mockResolvedValue(running)
    vi.spyOn(api, "getLiveArtifacts").mockResolvedValue({ artifacts: [] })
    vi.spyOn(api, "getLiveEvents").mockResolvedValue({ events: [{ sequence: 1, type: "execution.started", agent_id: "root", agent_name: "Root", payload: {}, created_at: stamp }], next_after: 1, has_more: false })
    vi.spyOn(api, "getTree").mockResolvedValue(null as never)
    vi.mocked(openRunStream).mockReturnValue(vi.fn())
  })

  it("reads the pinned historical bindings and shows deleted identity without sensitive fields", async () => {
    vi.mocked(api.getLiveRun).mockResolvedValue({ ...running, status: "completed", final_status: "completed", finished_at: stamp })
    const version = { id: "version-1", version_number: 1, agents: [{ id: "root", agent_type: "root", name: "Historical Root",
      provider_connection_id: null, model_id: "original-model", capabilities: [], provider_reference: { id: "old-provider", name: "Original Provider", resource_type: "gemini", deleted: true, secret_value: "must-never-render" } }], tool_assignments: [] }
    vi.mocked(api.getTree).mockResolvedValue({ id: "tree-1", name: "History Tree", current_version_id: "version-2", version: { ...version, id: "version-2" } } as never)
    vi.spyOn(api, "getTreeVersion").mockResolvedValue(version as never)
    mount()
    expect(await screen.findByText(/Original Provider/)).toBeInTheDocument()
    expect(api.getTreeVersion).toHaveBeenCalledWith("tree-1", "version-1")
    expect(screen.getByText(/Resource deleted — history retained/)).toBeInTheDocument()
    expect(screen.queryByText("must-never-render")).not.toBeInTheDocument()
  })
  it("shows specialist text while still running and refreshes artifacts from a durable event", async () => {
    vi.mocked(api.getLiveArtifacts).mockResolvedValueOnce({ artifacts: [] }).mockResolvedValueOnce({ artifacts: [artifact] })
    mount()
    await waitFor(() => expect(openRunStream).toHaveBeenCalled())
    const callbacks = vi.mocked(openRunStream).mock.calls[0][1]
    act(() => {
      callbacks.onDelta({ role: "specialist", agent_id: "worker", operation_id: "op", delta: "live text", dropped_before: 0 })
      callbacks.onEvent({ sequence: 2, type: "artifact.committed", agent_id: "worker", agent_name: "Worker", payload: {}, created_at: stamp })
    })
    expect(await screen.findByText("live text")).toBeInTheDocument()
    expect(screen.getByText("Running")).toBeInTheDocument()
    expect(await screen.findByText("fix.patch")).toBeInTheDocument()
    expect(screen.getByText("Intermediate / history")).toBeInTheDocument()
  })
  it("requests cancellation once and represents the requested state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    vi.spyOn(api, "cancelLiveRun").mockResolvedValue({ status: "cancellation_requested" })
    vi.mocked(api.getLiveRun).mockResolvedValueOnce(running).mockResolvedValueOnce({ ...running, status: "cancellation_requested", cancellation_requested: true })
    mount()
    const button = await screen.findByRole("button", { name: "Cancel Run" })
    fireEvent.click(button)
    await waitFor(() => expect(api.cancelLiveRun).toHaveBeenCalledTimes(1))
    expect(await screen.findByText("Cancellation requested. Waiting for the runtime to stop.")).toBeInTheDocument()
  })
  it("shows a partial final result and preserves committed artifacts after refresh", async () => {
    vi.mocked(api.getLiveRun).mockResolvedValue({ ...running, status: "completed", final_status: "partial", final_output: "Root answer" })
    vi.spyOn(api, "getLiveResult").mockResolvedValue({ final_output: "Root answer", final_status: "partial" })
    vi.mocked(api.getLiveArtifacts).mockResolvedValue({ artifacts: [artifact] })
    mount()
    expect(await screen.findByText("Root answer")).toBeInTheDocument()
    expect(screen.getByText("Partial")).toBeInTheDocument()
    expect(screen.queryByText("Completed")).not.toBeInTheDocument()
    expect(screen.getByText(/Some branches failed/)).toBeInTheDocument()
    expect(screen.getByText("fix.patch")).toBeInTheDocument()
    expect(openRunStream).not.toHaveBeenCalled()
  })
  it("labels the completed Core final status from real external Runs", async () => {
    vi.mocked(api.getLiveRun).mockResolvedValue({ ...running, status: "completed", final_status: "completed", final_output: "Final answer" })
    vi.spyOn(api, "getLiveResult").mockResolvedValue({ final_output: "Final answer", final_status: "completed" })
    mount()
    expect(await screen.findByText("Completed")).toBeInTheDocument()
    expect(await screen.findByText("Final answer")).toBeInTheDocument()
  })
  it("shows explicit repair notice without hiding its trace event or upgrading a partial result", async () => {
    vi.mocked(api.getLiveRun).mockResolvedValue({ ...running, status: "completed", final_status: "partial", final_output: "Recovered answer" })
    vi.spyOn(api, "getLiveResult").mockResolvedValue({ final_output: "Recovered answer", final_status: "partial" })
    vi.mocked(api.getLiveEvents).mockResolvedValue({ events: [{ sequence: 1, type: "structured_decision.repair.succeeded", agent_id: "root", agent_name: "Root", payload: {}, created_at: stamp }], next_after: 1, has_more: false })
    mount()
    expect(await screen.findByText(i18n.t("integrationPolish.recoveryNotice"))).toBeInTheDocument()
    expect(screen.getByText("Structured decision repair succeeded")).toBeInTheDocument()
    expect(screen.getByText("Partial")).toBeInTheDocument()
    expect(screen.queryByText("Completed")).not.toBeInTheDocument()
  })
  it("shows a safe provider failure category and numeric usage without raw response text", async () => {
    vi.mocked(api.getLiveRun).mockResolvedValue({ ...running, status: "failed", final_status: "failed",
      error: { code: "PROVIDER_RATE_LIMIT", message: "Provider rate limit exceeded" },
      usage: { total_tokens: 24, calls: [{ token: "hidden" }] }, metrics: { tool_metrics: { calls: 2 } } })
    vi.spyOn(api, "getLiveResult").mockResolvedValue({ final_output: null, final_status: "failed" })
    mount()
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider rate limit: Provider rate limit exceeded")
    fireEvent.click(screen.getByText("Usage and metrics"))
    expect(screen.getByText("24")).toBeInTheDocument()
    expect(screen.queryByText("hidden")).not.toBeInTheDocument()
  })
})
