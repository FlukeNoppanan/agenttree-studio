import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AgentHierarchy } from "@/components/tree/agent-hierarchy"
import i18n from "@/i18n"
import { api, type ProviderConnection, type ProviderModel, type ToolConnection, type TreeDetail, type TreeTemplate } from "@/lib/api"
import { TemplatesPage } from "@/pages/templates"

const agent = (id: string, name: string, agent_type: "root" | "manager" | "specialist", parent_agent_id: string | null) => ({
  id, name, agent_type, parent_agent_id, description: "", capabilities: ["planning"],
  provider_connection_id: "provider-1", model_id: "ready-model", system_instruction: "Coordinate safely",
  settings: {},
})
const tree = {
  id: "tree-1", name: "Coding Tree", version: {
    agents: [agent("root", "Main Orchestrator", "root", null), agent("manager-a", "Coding Manager", "manager", "root"),
      agent("manager-b", "Review Manager", "manager", "root"), agent("specialist-a", "Backend Coder", "specialist", "manager-a"),
      agent("specialist-b", "Security Reviewer", "specialist", "manager-b")],
    tool_assignments: [{ agent_config_id: "specialist-a", tool_connection_id: "tool-1" }],
  },
} as TreeDetail
const providers = [{ id: "provider-1", name: "Production Provider" }] as ProviderConnection[]
const models = [{ id: "model-1", provider_connection_id: "provider-1", model_id: "ready-model", display_name: "Ready Model" }] as ProviderModel[]
const tools = [{ id: "tool-1", name: "Filesystem MCP" }] as ToolConnection[]

describe("Tree hierarchy and Agent details", () => {
  beforeEach(async () => { await i18n.changeLanguage("en") })

  it("shows real Root, Manager and Specialist names under their correct parents", () => {
    render(<MemoryRouter><AgentHierarchy tree={tree} providers={providers} models={models} tools={tools} /></MemoryRouter>)
    const canvas = screen.getByTestId("tree-canvas")
    expect(canvas).toHaveClass("overflow-x-auto")
    for (const name of ["Main Orchestrator", "Coding Manager", "Review Manager", "Backend Coder", "Security Reviewer"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument()
    }
    expect(screen.getByRole("button", { name: /Backend Coder/ }).closest("[data-branch]")).toHaveAttribute("data-branch", "manager-a")
    expect(screen.getByRole("button", { name: /Security Reviewer/ })).toHaveAttribute("data-parent-id", "manager-b")
  })

  it("opens a keyboard-accessible side detail with provider, model and tools, without credentials", () => {
    render(<MemoryRouter><AgentHierarchy tree={tree} providers={providers} models={models} tools={tools} /></MemoryRouter>)
    const node = screen.getByRole("button", { name: /Backend Coder/ })
    node.focus()
    fireEvent.keyDown(node, { key: "Enter" })
    fireEvent.click(node)
    expect(screen.getByTestId("agent-detail-drawer")).toBeInTheDocument()
    expect(screen.getByText("Production Provider")).toBeInTheDocument()
    expect(screen.getByText("Ready Model")).toBeInTheDocument()
    expect(screen.getByText("Filesystem MCP")).toBeInTheDocument()
    expect(screen.getByText("Coding Manager", { selector: "dd" })).toBeInTheDocument()
    expect(screen.queryByText(/api.key|credential|secret-value/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByTestId("agent-detail-drawer")).not.toBeInTheDocument()
  })

  it("renders Thai hierarchy labels without changing the configured names", async () => {
    await i18n.changeLanguage("th")
    render(<MemoryRouter><AgentHierarchy tree={tree} providers={providers} models={models} tools={tools} /></MemoryRouter>)
    expect(screen.getByText("เลือก Agent เพื่อดูรายละเอียดการตั้งค่า")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Main Orchestrator/ })).toBeInTheDocument()
  })

  it("navigates topology with arrow keys and never mutates inspected data", () => {
    const before = JSON.stringify(tree)
    render(<MemoryRouter><AgentHierarchy tree={tree} providers={providers} models={models} tools={tools} /></MemoryRouter>)
    const root = screen.getByRole("button", { name: /Main Orchestrator/ })
    root.focus()
    fireEvent.keyDown(root, { key: "ArrowDown" })
    const manager = screen.getByRole("button", { name: /Coding Manager/ })
    expect(manager).toHaveFocus()
    fireEvent.keyDown(manager, { key: "ArrowDown" })
    const specialist = screen.getByRole("button", { name: /Backend Coder/ })
    expect(specialist).toHaveFocus()
    fireEvent.click(specialist)
    expect(screen.queryByRole("button", { name: "Edit Agent" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(JSON.stringify(tree)).toBe(before)
    fireEvent.keyDown(specialist, { key: "Home" })
    expect(root).toHaveFocus()
  })

  it("offers editing only when the caller grants permission", () => {
    render(<MemoryRouter><AgentHierarchy canEdit tree={tree} providers={providers} models={models} tools={tools} /></MemoryRouter>)
    fireEvent.click(screen.getByRole("button", { name: /Main Orchestrator/ }))
    expect(screen.getByRole("button", { name: "Edit Agent" })).toBeInTheDocument()
  })
})

describe("Existing Blank Tree template", () => {
  it("can be inspected and starts a new Tree without replacing an existing one", async () => {
    await i18n.changeLanguage("en")
    const blank: TreeTemplate = {
      id: "builtin-blank", name: "Blank Tree", description: "A clean Root Agent starting point.", category: "general",
      template_type: "builtin", agent_count: 1, manager_count: 0, specialist_count: 0, created_by: null,
      created_at: null, updated_at: null, definition: { schema_version: 1, suggested_tools: [], tool_requirements: [], trigger: null,
        output: null, metadata: {}, agents: [{ key: "root", agent_type: "root", name: "Root Agent",
          role: "Coordinator",
          description: "Receives work.", parent_key: null, system_instruction: null, capabilities: [], settings: {} }] },
    }
    vi.spyOn(api, "listTemplates").mockResolvedValue([blank])
    render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }))
    expect(screen.getByText("Agent structure")).toBeInTheDocument()
    expect(screen.getByText("Root Agent")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Use Template" })).toBeInTheDocument()
  })
})
