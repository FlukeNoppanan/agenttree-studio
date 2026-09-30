import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TemplateSetupPage } from "@/pages/trees/template-setup"
import type { TemplateSetupRead, TemplateToolRequirementStatus } from "@/lib/api"

const mocks = vi.hoisted(() => ({
  getTemplateSetup: vi.fn(), bindTemplateAgentModel: vi.fn(), applyTemplateDefault: vi.fn(),
  createTemplateAgent: vi.fn(), updateTemplateAgent: vi.fn(), updateTemplateAgentTools: vi.fn(),
  resolveTemplateRequirement: vi.fn(), resolveAllRequiredTemplateTools: vi.fn(),
  validateTree: vi.fn(), listToolCatalog: vi.fn(), listTools: vi.fn(), listCapabilities: vi.fn(), listSecrets: vi.fn(), can: vi.fn(() => true),
}))
vi.mock("@/lib/api", () => ({ api: mocks }))
vi.mock("@/auth", () => ({ useAuth: () => ({ can: mocks.can }) }))

const provider = { id: "local", name: "Local Ollama", provider_type: "ollama" as const, models: [
  { id: "m1", provider_connection_id: "local", model_id: "gemma4:e4b", display_name: "gemma4:e4b", metadata: null, is_available: true, generation_candidate: true, qualification_status: "qualified" as const, qualification_checked_at: null, qualification_error_code: null, qualification_message: null, discovered_at: "now" },
  { id: "m2", provider_connection_id: "local", model_id: "qwen3:1.7b", display_name: "qwen3:1.7b", metadata: null, is_available: true, generation_candidate: true, qualification_status: "qualified" as const, qualification_checked_at: null, qualification_error_code: null, qualification_message: null, discovered_at: "now" },
] }
const agents = [
  { id: "root-id", agent_type: "root" as const, name: "Analysis Lead", description: "Reviews the answer.", parent_agent_id: null, provider_connection_id: null, model_id: null, system_instruction: "Coordinate the analysis.", capabilities: ["analysis"], settings: {}, created_at: "now", updated_at: "now" },
  { id: "manager-id", agent_type: "manager" as const, name: "Research Manager", description: "Coordinates research.", parent_agent_id: "root-id", provider_connection_id: null, model_id: null, system_instruction: "Coordinate research.", capabilities: ["research"], settings: {}, created_at: "now", updated_at: "now" },
  { id: "specialist-id", agent_type: "specialist" as const, name: "Research Specialist", description: "Finds evidence.", parent_agent_id: "manager-id", provider_connection_id: null, model_id: null, system_instruction: "Find supported facts.", capabilities: ["fact finding"], settings: {}, created_at: "now", updated_at: "now" },
]
const required: TemplateToolRequirementStatus = {
  id: "artifact", catalog_key: "artifact-output", requirement: "required", agent_ref: "specialist", agent_id: "specialist-id", reason: "Save the result.", package_name: "Artifact Output", package_status: "ready", state: "available_to_add", tool_id: null, action: "add", discovered_tools: [],
}
const soon: TemplateToolRequirementStatus = {
  id: "workspace", catalog_key: "filesystem-workspace", requirement: "recommended", agent_ref: "specialist", agent_id: "specialist-id", reason: "Future workspace access.", package_name: "Filesystem / Workspace", package_status: "coming_soon", state: "coming_soon", tool_id: null, action: "none", discovered_tools: [],
}
const mcp: TemplateToolRequirementStatus = {
  id: "mcp", catalog_key: "generic-mcp-http", requirement: "recommended", agent_ref: "specialist", agent_id: "specialist-id", reason: "Optional MCP server.", package_name: "Generic MCP Server", package_status: "ready", state: "needs_configuration", tool_id: "mcp-1", action: "configure", discovered_tools: [{ name: "search", description: "Search sources.", input_schema: {}, selected: false }],
}

function fixture(overrides: Partial<TemplateSetupRead> = {}): TemplateSetupRead {
  const issue = { step: "root", code: "provider_required", message: "Analysis Lead needs a provider", agent_id: "root-id" }
  return {
    tree: { id: "tree-1", name: "Analysis Tree", description: "Review a question.", status: "draft", version_number: 1, managers_count: 1, specialists_count: 1, updated_at: "now", template: "builtin-general-analysis", current_version_id: "version-1", root: agents[0], provider_usage: [], trigger_type: "manual_form", output_type: "text", version: { id: "version-1", tree_id: "tree-1", version_number: 1, status: "draft", agents, tool_assignments: [], trigger: null, output: null, created_at: "now", updated_at: "now" }, created_at: "now" },
    definition: { schema_version: 2, suggested_tools: [], tool_requirements: [
      { id: required.id, catalog_key: required.catalog_key, requirement: required.requirement, agent_ref: required.agent_ref, reason: required.reason },
      { id: soon.id, catalog_key: soon.catalog_key, requirement: soon.requirement, agent_ref: soon.agent_ref, reason: soon.reason },
      { id: mcp.id, catalog_key: mcp.catalog_key, requirement: mcp.requirement, agent_ref: mcp.agent_ref, reason: mcp.reason },
    ], agents: [
      { key: "root", agent_type: "root", role: "Coordinator", name: "Analysis Lead", description: "Reviews the answer.", parent_key: null, system_instruction: "Coordinate the analysis.", capabilities: ["analysis"], settings: {} },
      { key: "research", agent_type: "manager", role: "Research lead", name: "Research Manager", description: "Coordinates research.", parent_key: "root", system_instruction: "Coordinate research.", capabilities: ["research"], settings: {} },
      { key: "specialist", agent_type: "specialist", role: "Researcher", name: "Research Specialist", description: "Finds evidence.", parent_key: "research", system_instruction: "Find supported facts.", capabilities: ["fact finding"], settings: {} },
    ], trigger: null, output: null, metadata: {} },
    agents: agents.map((agent, index) => ({ agent_ref: ["root", "research", "specialist"][index], role: ["Coordinator", "Research lead", "Researcher"][index], agent, requirement_ids: index === 2 ? [required.id, soon.id] : [] })),
    providers: [provider], tool_requirements: [required, soon, mcp],
    readiness: { ready: false, ready_agent_count: 0, total_agent_count: 3, agents_missing_models: agents.map(item => item.name), agents_missing_instructions: [], required_tools_ready: 0, required_tools_total: 1, required_tools_unresolved: ["Artifact Output"], validation_issues: [issue] },
    warnings: [], ...overrides,
  }
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/trees/tree-1/setup"]}><Routes>
    <Route path="/trees/:treeId/setup" element={<TemplateSetupPage />} />
    <Route path="/trees/:treeId" element={<div>Tree detail</div>} />
    <Route path="/trees/:treeId/edit" element={<div>Advanced editor</div>} />
  </Routes></MemoryRouter>)
}

const catalog = [
  { id: "artifact-output", name: "Artifact Output", description: "Create artifacts.", config_fields: [], required_secrets: [] },
  { id: "web-api-request", name: "Web/API Request", description: "Call an HTTP API.", config_fields: [{ key: "url", kind: "url", required: true, options: [] }], required_secrets: [] },
  { id: "filesystem-workspace", name: "Filesystem / Workspace", description: "Coming later.", config_fields: [], required_secrets: [] },
  { id: "generic-mcp-http", name: "Generic MCP Server", description: "Connect to MCP.", config_fields: [{ key: "url", kind: "url", required: true, options: [] }], required_secrets: [] },
]

describe("Template Setup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.can.mockReturnValue(true)
    mocks.getTemplateSetup.mockResolvedValue(fixture())
    mocks.listToolCatalog.mockResolvedValue(catalog)
    mocks.listTools.mockResolvedValue([])
    mocks.listCapabilities.mockResolvedValue([])
    mocks.listSecrets.mockResolvedValue([])
    mocks.bindTemplateAgentModel.mockResolvedValue(fixture())
    mocks.applyTemplateDefault.mockResolvedValue(fixture({
      tree: { ...fixture().tree, version: { ...fixture().tree.version, agents: agents.map(agent => ({ ...agent, provider_connection_id: "local", model_id: "gemma4:e4b" })) } },
      agents: fixture().agents.map(item => ({ ...item, agent: { ...item.agent, provider_connection_id: "local", model_id: "gemma4:e4b" } })),
    }))
    mocks.resolveTemplateRequirement.mockResolvedValue(fixture({ tool_requirements: [{ ...required, state: "ready", tool_id: "artifact-1", action: "none" }, soon, { ...mcp, state: "ready", action: "none" }] }))
    const readyAgents = agents.map(agent => ({ ...agent, provider_connection_id: "local", model_id: "gemma4:e4b" }))
    mocks.resolveAllRequiredTemplateTools.mockResolvedValue(fixture({
      tree: { ...fixture().tree, version: { ...fixture().tree.version, agents: readyAgents } },
      agents: fixture().agents.map(item => ({ ...item, agent: { ...item.agent, provider_connection_id: "local", model_id: "gemma4:e4b" } })),
      tool_requirements: [{ ...required, state: "ready", tool_id: "artifact-1", action: "none" }, soon, { ...mcp, state: "ready", action: "none" }],
      readiness: { ready: true, ready_agent_count: 3, total_agent_count: 3, agents_missing_models: [], agents_missing_instructions: [], required_tools_ready: 1, required_tools_total: 1, required_tools_unresolved: [], validation_issues: [] },
    }))
    mocks.validateTree.mockResolvedValue({ valid: false, errors: [], validated_at: "now" })
  })

  it("keeps default model selection local until explicit Apply to all", async () => {
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.change(document.querySelector("#default-provider")!, { target: { value: "local" } })
    fireEvent.change(document.querySelector("#default-model")!, { target: { value: "gemma4:e4b" } })
    expect(mocks.applyTemplateDefault).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Apply to all Agents" }))
    await waitFor(() => expect(mocks.applyTemplateDefault).toHaveBeenCalledWith("tree-1", { provider_connection_id: "local", model_id: "gemma4:e4b" }))
  })

  it("opens node settings and saves an individual Agent model binding", async () => {
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.click(screen.getByRole("button", { name: "Specialist: Research Specialist" }))
    expect(await screen.findByText(/Agent Settings/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "local" } })
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gemma4:e4b" } })
    mocks.updateTemplateAgent.mockResolvedValue(fixture())
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocks.updateTemplateAgent).toHaveBeenCalledWith("tree-1", "specialist-id", expect.objectContaining({ provider_connection_id: "local", model_id: "gemma4:e4b" })))
  })

  it("adds a ready required Tool and shows coming soon recommendations", async () => {
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.click(screen.getByRole("button", { name: "Specialist: Research Specialist" }))
    expect(screen.getByText("Coming soon")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add Tool" }))
    await waitFor(() => expect(mocks.resolveTemplateRequirement).toHaveBeenCalledWith("artifact-output", {
      tree_id: "tree-1", requirement_id: "artifact", agent_id: "specialist-id", setup: {},
    }))
  })

  it("adds all ready config-free required Tools, then finishes only after validation succeeds", async () => {
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.click(screen.getByRole("button", { name: "Add all ready required Tools" }))
    await waitFor(() => expect(mocks.resolveAllRequiredTemplateTools).toHaveBeenCalledWith("tree-1"))
    mocks.validateTree.mockResolvedValue({ valid: true, errors: [], validated_at: "now" })
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }))
    await waitFor(() => expect(mocks.validateTree).toHaveBeenCalledWith("tree-1", true))
    expect(await screen.findByText("Tree detail")).toBeInTheDocument()
  })

  it("lets the user select discovered MCP tools before assigning the connection", async () => {
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.click(screen.getByRole("button", { name: "Specialist: Research Specialist" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Set up Tool" })[0])
    const checkbox = await screen.findByRole("checkbox", { name: /search/ })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole("button", { name: "Assign Tool" }))
    await waitFor(() => expect(mocks.resolveTemplateRequirement).toHaveBeenCalledWith("generic-mcp-http", {
      tree_id: "tree-1", requirement_id: "mcp", agent_id: "specialist-id", selected_tools: ["search"],
    }))
  })

  it("opens Advanced Tree Editor without changing the guided setup route", async () => {
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.click(screen.getAllByRole("button", { name: "Advanced Tree Editor" })[0])
    expect(await screen.findByText("Advanced editor")).toBeInTheDocument()
  })

  it("shows Blank Tree hierarchy and adds a Manager directly from setup", async () => {
    const blank = fixture()
    blank.tree.name = "Blank Tree"
    blank.tree.version.agents = [agents[0]]
    blank.agents = [blank.agents[0]]
    blank.definition.agents = [blank.definition.agents[0]]
    blank.tool_requirements = []
    blank.readiness = { ...blank.readiness, total_agent_count: 1, required_tools_total: 0, required_tools_unresolved: [], validation_issues: [
      { step: "managers", code: "manager_required", message: "Tree must have at least one Manager", agent_id: null },
    ] }
    mocks.getTemplateSetup.mockResolvedValue(blank)
    const manager = { ...agents[1], id: "new-manager", name: "New Manager" }
    mocks.createTemplateAgent.mockResolvedValue({ ...blank,
      tree: { ...blank.tree, version: { ...blank.tree.version, agents: [agents[0], manager] } },
      agents: [...blank.agents, { agent_ref: null, role: "Manager", agent: manager, requirement_ids: [] }],
    })
    renderPage()
    expect(await screen.findByRole("button", { name: "Root: Analysis Lead" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add Manager" }))
    await waitFor(() => expect(mocks.createTemplateAgent).toHaveBeenCalledWith("tree-1", { agent_type: "manager", parent_agent_id: "root-id", name: "New Manager" }))
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect(await screen.findByRole("button", { name: "Manager: New Manager" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Specialist" })).toBeInTheDocument()
  })

  it("keeps other nodes bound when a Specialist overrides the default model", async () => {
    const applied = fixture({
      tree: { ...fixture().tree, version: { ...fixture().tree.version, agents: agents.map(agent => ({ ...agent, provider_connection_id: "local", model_id: "gemma4:e4b" })) } },
      agents: fixture().agents.map(item => ({ ...item, agent: { ...item.agent, provider_connection_id: "local", model_id: "gemma4:e4b" } })),
    })
    mocks.applyTemplateDefault.mockResolvedValue(applied)
    mocks.updateTemplateAgent.mockResolvedValue({ ...applied,
      tree: { ...applied.tree, version: { ...applied.tree.version, agents: applied.tree.version.agents.map(agent => agent.id === "specialist-id" ? { ...agent, model_id: "qwen3:1.7b" } : agent) } },
      agents: applied.agents.map(item => item.agent.id === "specialist-id" ? { ...item, agent: { ...item.agent, model_id: "qwen3:1.7b" } } : item),
    })
    renderPage()
    await screen.findByText(/Analysis Tree/)
    fireEvent.change(screen.getByLabelText("Default Provider"), { target: { value: "local" } })
    fireEvent.change(screen.getByLabelText("Default Model"), { target: { value: "gemma4:e4b" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply to all Agents" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Specialist: Research Specialist" })).toHaveTextContent("gemma4:e4b"))
    fireEvent.click(screen.getByRole("button", { name: "Specialist: Research Specialist" }))
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "qwen3:1.7b" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Specialist: Research Specialist" })).toHaveTextContent("qwen3:1.7b"))
    expect(screen.getByRole("button", { name: "Root: Analysis Lead" })).toHaveTextContent("gemma4:e4b")
    expect(screen.getByRole("button", { name: "Manager: Research Manager" })).toHaveTextContent("gemma4:e4b")
  })

  it("keeps the Tree visible when Agent save or Tool Catalog loading fails", async () => {
    mocks.listToolCatalog.mockRejectedValue(new Error("Catalog unavailable"))
    mocks.updateTemplateAgent.mockRejectedValue(new Error("Agent save failed"))
    renderPage()
    await screen.findByRole("button", { name: "Root: Analysis Lead" })
    fireEvent.click(screen.getByRole("button", { name: "Root: Analysis Lead" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Agent save failed")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Root: Analysis Lead", hidden: true })).toBeInTheDocument()
  })
})
