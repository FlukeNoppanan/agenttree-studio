import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TemplatesPage } from "@/pages/templates"
import type { TreeTemplate } from "@/lib/api"

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(), instantiateTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: mocks }))

const template: TreeTemplate = {
  id: "builtin-general-analysis", name: "General Analysis", description: "Research and synthesis.", category: "analysis",
  template_type: "builtin", agent_count: 3, manager_count: 1, specialist_count: 1, created_by: null,
  created_at: null, updated_at: null,
  definition: { schema_version: 2, suggested_tools: [], tool_requirements: [{ id: "api", catalog_key: "web-api-request", requirement: "recommended", agent_ref: "researcher", reason: "Optional API access." }],
    trigger: { trigger_type: "manual_form", config: {} }, output: { output_type: "text", delivery_type: "show_in_web", config: {} }, metadata: {},
    agents: [
      { key: "root", agent_type: "root", role: "Coordinator", name: "Analysis Lead", description: "Reviews the answer.", parent_key: null, system_instruction: null, capabilities: ["analysis"], settings: {} },
      { key: "research", agent_type: "manager", role: "Research lead", name: "Research Manager", description: "Coordinates research.", parent_key: "root", system_instruction: null, capabilities: ["research"], settings: {} },
      { key: "researcher", agent_type: "specialist", role: "Researcher", name: "Research Specialist", description: "Finds facts.", parent_key: "research", system_instruction: null, capabilities: ["fact finding"], settings: {} },
    ] },
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/templates"]}><Routes>
    <Route path="/templates" element={<TemplatesPage />} />
    <Route path="/trees/:treeId/setup" element={<div>Independent draft setup</div>} />
  </Routes></MemoryRouter>)
}

describe("reusable Template catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTemplates.mockResolvedValue([template])
  })

  it("previews the hierarchy, capabilities, tools, input, and output without creating a Tree", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }))
    expect(await screen.findByText("Research Specialist")).toBeInTheDocument()
    expect(screen.getAllByText("Web/API Request")).toHaveLength(2)
    expect(screen.getByText("Manual form")).toBeInTheDocument()
    expect(screen.getByText("Text · Show in Studio")).toBeInTheDocument()
    expect(mocks.instantiateTemplate).not.toHaveBeenCalled()
  })

  it("creates a new draft before opening Template Setup", async () => {
    mocks.instantiateTemplate.mockResolvedValue({ id: "new-tree" })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Use Template" }))
    expect(await screen.findByText("Independent draft setup")).toBeInTheDocument()
    expect(mocks.instantiateTemplate).toHaveBeenCalledWith(template.id)
  })

  it("offers edit and delete only for User Templates", async () => {
    const userTemplate = { ...template, id: "user-template", template_type: "user" as const }
    mocks.listTemplates.mockResolvedValue([template, userTemplate])
    mocks.updateTemplate.mockResolvedValue({ ...userTemplate, name: "Edited" })
    renderPage()
    const edit = await screen.findByRole("button", { name: "Edit Template" })
    fireEvent.click(edit)
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Edited" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocks.updateTemplate).toHaveBeenCalledWith("user-template", expect.objectContaining({ name: "Edited" })))
    expect(screen.getByText("Edited")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Edit Template" })).toHaveLength(1)
  })
})
