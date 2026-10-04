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
    <Route path="/trees/new/visual" element={<div>Visual Builder draft</div>} />
    <Route path="/trees/:treeId/edit" element={<div>Advanced Tree Editor</div>} />
  </Routes></MemoryRouter>)
}

describe("reusable Template catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTemplates.mockResolvedValue([template])
  })

  it("combines difficulty, category and capability search without creating Trees", async () => {
    mocks.listTemplates.mockResolvedValue([
      { ...template, definition: { ...template.definition, metadata: { difficulty: "beginner" } } },
      { ...template, id: "advanced-review", name: "Advanced Review", category: "engineering", definition: { ...template.definition, metadata: { difficulty: "advanced" } } },
    ])
    renderPage()
    await screen.findByRole("article", { name: "General Analysis" })
    fireEvent.change(screen.getByRole("combobox", { name: "Difficulty" }), { target: { value: "advanced" } })
    expect(screen.queryByRole("article", { name: "General Analysis" })).not.toBeInTheDocument()
    expect(screen.getByRole("article", { name: "Advanced Review" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "analysis" } })
    expect(screen.queryAllByRole("article")).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(screen.getAllByRole("article")).toHaveLength(2)
    fireEvent.change(screen.getByRole("textbox", { name: "Search Templates or capabilities" }), { target: { value: "fact finding" } })
    expect(screen.getAllByRole("article")).toHaveLength(2)
    expect(mocks.instantiateTemplate).not.toHaveBeenCalled()
  })

  it("keeps preview cancellation free of new Tree records", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }))
    expect(screen.getByText(/verified Model/i)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(mocks.instantiateTemplate).not.toHaveBeenCalled()
  })

  it("previews the hierarchy, capabilities, tools, input, and output without creating a Tree", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }))
    expect(await screen.findByText("Research Specialist")).toBeInTheDocument()
    expect(screen.getAllByText(/Web\/API Request/)).toHaveLength(2)
    expect(screen.getByText("Manual form")).toBeInTheDocument()
    expect(screen.getByText("Text · Show in Studio")).toBeInTheDocument()
    expect(mocks.instantiateTemplate).not.toHaveBeenCalled()
  })

  it("opens unsaved Visual Builder directly without instantiating a Tree", async () => {
    mocks.instantiateTemplate.mockResolvedValue({ id: "new-tree" })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Use Template" }))
    expect(await screen.findByText("Visual Builder draft")).toBeInTheDocument()
    expect(screen.queryByText("Advanced Tree Editor")).not.toBeInTheDocument()
    expect(mocks.instantiateTemplate).not.toHaveBeenCalled()
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
