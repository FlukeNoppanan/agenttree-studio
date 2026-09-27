import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RunArtifacts } from "@/components/live/run-artifacts"
import { api, type LiveArtifact } from "@/lib/api"

const base: LiveArtifact = { artifact_id: "v1", type: "patch", name: "<script>alert(1)</script>.patch",
  path: "src/file.patch", operation: "modify", media_type: "text/x-diff", size_bytes: 11,
  sha256: "a".repeat(64), producer_role: "specialist", producer_agent_id: "worker",
  is_final: false, body_available: true, created_at: "2026-09-27T00:00:00Z" }

describe("artifact revision history", () => {
  afterEach(() => vi.restoreAllMocks())
  it("labels superseded and final versions and fetches an inert patch preview", async () => {
    const fetch = vi.spyOn(api, "fetchLiveArtifact").mockResolvedValue(new Blob(["+new line\n<script>bad()</script>"], { type: "text/x-diff" }))
    render(<RunArtifacts runId="run" artifacts={[base, { ...base, artifact_id: "v2", name: "v2.patch",
      supersedes_artifact_id: "v1", is_final: true }]} />)
    expect(screen.getByText("Superseded")).toBeInTheDocument()
    expect(screen.getByText("Final")).toBeInTheDocument()
    expect(document.querySelector("script")).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0])
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("run", "v2"))
    expect(await screen.findByText(/\+new line/)).toBeInTheDocument()
    expect(document.querySelector("script")).toBeNull()
  })
})
