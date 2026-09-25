import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TreeWizard } from "@/components/tree/tree-wizard"
import i18n from "@/i18n"
import { api, type TreeDetail } from "@/lib/api"

const agent = (id: string, agent_type: "root" | "manager" | "specialist", parent_agent_id: string | null) => ({
  id, agent_type, parent_agent_id, name: `${agent_type} name`, description: "", capabilities: ["planning"],
  provider_connection_id: "provider-1", model_id: "ready-model", system_instruction: "", settings: {},
})
const ready = {
  id: "tree-1", name: "Existing Tree", description: "Persisted configuration", template: "blank", status: "ready",
  version: { agents: [agent("root", "root", null), agent("manager", "manager", "root"), agent("specialist", "specialist", "manager")],
    tool_assignments: [{ agent_config_id: "specialist", tool_connection_id: "tool-1" }], trigger: null, output: null },
} as TreeDetail

describe("editing a Ready Tree", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    vi.spyOn(api, "getTree").mockResolvedValue(ready)
    vi.spyOn(api, "listProviders").mockResolvedValue([])
    vi.spyOn(api, "listTools").mockResolvedValue([])
    vi.spyOn(api, "replaceReadyTree").mockResolvedValue(ready)
    vi.spyOn(api, "saveTreeDraft").mockResolvedValue(ready)
  })
  afterEach(() => vi.restoreAllMocks())

  it("loads persisted configuration and submits edits to the validated versioned endpoint", async () => {
    render(<MemoryRouter initialEntries={["/trees/tree-1/edit"]}><Routes><Route path="/trees/:treeId/edit" element={<TreeWizard />} /></Routes></MemoryRouter>)
    expect(await screen.findByDisplayValue("Existing Tree")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue("Existing Tree"), { target: { value: "Renamed Existing Tree" } })
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))
    await waitFor(() => expect(api.replaceReadyTree).toHaveBeenCalledWith("tree-1", expect.objectContaining({
      name: "Renamed Existing Tree",
      tool_assignments: [{ agent_config_id: "specialist", tool_connection_id: "tool-1" }],
    })))
    expect(api.saveTreeDraft).not.toHaveBeenCalled()
  })
})
