import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { TreeWizard } from "@/components/tree/tree-wizard"
import { emptyAgent, emptyWizard, wizardFromTree, wizardPayload } from "@/components/tree/types"
import { ToolTypeSelector } from "@/components/tools/tool-type-selector"
import { api, type TreeDetail } from "@/lib/api"

function configuredTree() {
  const state = emptyWizard()
  const first = emptyAgent("Manager A")
  const second = emptyAgent("Manager B")
  first.allowed_manager_peer_ids = [second.id]
  state.managers = [{ agent: first, specialists: [emptyAgent("Worker A")] },
    { agent: second, specialists: [emptyAgent("Worker B")] }]
  state.root.provider_connection_id = "openrouter"
  state.root.model_id = "openai/gpt-oss-20b"
  state.root.tool_connection_ids = ["artifact-tool"]
  first.tool_connection_ids = ["manager-tool"]
  state.managers[0].specialists[0].tool_connection_ids = ["worker-tool"]
  return state
}

describe("Core parity configuration", () => {
  it("serializes exact model IDs, all role Tool bindings, and directional Manager peers", () => {
    const state = configuredTree()
    const payload = wizardPayload(state)
    expect(payload.agents[0].model_id).toBe("openai/gpt-oss-20b")
    expect(payload.tool_assignments).toEqual(expect.arrayContaining([
      { agent_config_id: state.root.id, tool_connection_id: "artifact-tool" },
      { agent_config_id: state.managers[0].agent.id, tool_connection_id: "manager-tool" },
      { agent_config_id: state.managers[0].specialists[0].id, tool_connection_id: "worker-tool" },
    ]))
    expect(payload.agents[1].settings?.allowed_manager_peer_ids).toEqual([state.managers[1].agent.id])
    expect(payload.agents[3].settings?.allowed_manager_peer_ids).toEqual([])
    const tree = { id: "tree", name: "Parity", description: "", template: "blank", status: "draft",
      version: { id: "version", agents: payload.agents, tool_assignments: payload.tool_assignments,
        trigger: null, output: null } } as TreeDetail
    const reloaded = wizardFromTree(tree)
    expect(reloaded.root.model_id).toBe("openai/gpt-oss-20b")
    expect(reloaded.root.tool_connection_ids).toEqual(["artifact-tool"])
    expect(reloaded.managers[0].agent.allowed_manager_peer_ids).toEqual([state.managers[1].agent.id])
  })

  it("shows artifact creation as an intentional Tool type", () => {
    const change = vi.fn()
    render(<ToolTypeSelector value="http_api" onChange={change} />)
    fireEvent.click(screen.getByRole("button", { name: /Artifact creation/ }))
    expect(change).toHaveBeenCalledWith("artifact")
  })

  it("renders a directional Manager collaboration editor", async () => {
    vi.spyOn(api, "listProviders").mockResolvedValue([])
    vi.spyOn(api, "listTools").mockResolvedValue([])
    render(<MemoryRouter><TreeWizard /></MemoryRouter>)
    await screen.findByText("Create Tree")
    fireEvent.click(screen.getByRole("button", { name: /Managers/i }))
    for (const name of ["Manager A", "Manager B"]) {
      fireEvent.click(screen.getByRole("button", { name: /Add Manager/i }))
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } })
      fireEvent.click(screen.getByRole("button", { name: "Save Agent" }))
    }
    const forward = screen.getByRole("checkbox", { name: "Manager A may contact Manager B" })
    const reverse = screen.getByRole("checkbox", { name: "Manager B may contact Manager A" })
    fireEvent.click(forward)
    expect(forward).toBeChecked()
    expect(reverse).not.toBeChecked()
    vi.restoreAllMocks()
  })
})
