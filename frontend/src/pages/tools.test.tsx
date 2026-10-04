import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"

import { ToolsPage } from "@/pages/tools"
import i18n from "@/i18n"
import type { DiscoveredTool, ToolConnection } from "@/lib/api"

const mocks = vi.hoisted(() => ({
  listTools: vi.fn(), listSecrets: vi.fn(), listTrees: vi.fn(), getTree: vi.fn(),
  listToolCatalog: vi.fn(),
  testTool: vi.fn(), discoverTool: vi.fn(), getTool: vi.fn(), deleteTool: vi.fn(),
}))

vi.mock("@/lib/api", () => ({ api: mocks }))

const discovered: DiscoveredTool = {
  name: "read_text_file",
  description: "Read text from a file.",
  input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  metadata: {},
  selected: false,
}

function connection(overrides: Partial<ToolConnection> = {}): ToolConnection {
  return {
    id: "tool-1", name: "Filesystem", tool_type: "mcp", description: "", enabled: true,
    secret_id: null, transport_type: "stdio", status: "not_configured", configuration: {},
    discovered_tools: [], assigned_agents_count: 0, last_checked_at: null, last_error: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
  }
}

async function renderPage(tool = connection()) {
  mocks.listTools.mockResolvedValue([tool])
  mocks.listSecrets.mockResolvedValue([])
  mocks.listTrees.mockResolvedValue([])
  mocks.listToolCatalog.mockResolvedValue([])
  render(<MemoryRouter><ToolsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole("button", { name: /My Tools/ }))
  await screen.findByText(tool.name)
  return tool
}

describe("ToolsPage MCP UX", () => {
  beforeEach(() => vi.clearAllMocks())

  it("localizes Artifact guidance and operations while retaining product names on live language switching", async () => {
    mocks.listTools.mockResolvedValue([])
    mocks.listSecrets.mockResolvedValue([])
    mocks.listTrees.mockResolvedValue([])
    mocks.listToolCatalog.mockResolvedValue([{ id: "artifact-output", name: "Artifact Output", description: "English fallback",
      category: "workspace", version: "1.0", icon: "file-output", status: "ready", tool_type: "artifact", transport_type: null,
      config_fields: [], required_secrets: [], operations: ["Create artifact", "Update artifact", "Delete artifact"],
      setup_instructions: ["English instruction fallback"],
    }])
    render(<MemoryRouter><ToolsPage /></MemoryRouter>)
    expect(await screen.findByText("Create Artifact")).toBeInTheDocument()
    try {
      await act(async () => { await i18n.changeLanguage("th") })
      expect(screen.getByRole("article", { name: "Artifact Output" })).toBeInTheDocument()
      for (const label of ["สร้าง Artifact", "อัปเดต Artifact", "ลบ Artifact"]) expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.queryByText("English fallback")).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "ตั้งค่า" }))
      expect(screen.getByText(/ไม่ต้องตั้งค่าการเชื่อมต่อหรือ Secret/)).toBeInTheDocument()
      await act(async () => { await i18n.changeLanguage("en") })
      expect(screen.getByText(/Each Artifact belongs to its Run/)).toBeInTheDocument()
      expect(screen.queryByText(/ไม่ต้องตั้งค่าการเชื่อมต่อหรือ Secret/)).not.toBeInTheDocument()
    } finally {
      await act(async () => { await i18n.changeLanguage("en") })
    }
  })

  it("presents MCP registration with source and scope without pretending to install", async () => {
    mocks.listTools.mockResolvedValue([])
    mocks.listSecrets.mockResolvedValue([])
    mocks.listTrees.mockResolvedValue([])
    mocks.listToolCatalog.mockResolvedValue([{ id: "filesystem-workspace", name: "Filesystem MCP", description: "Register an installed server",
      category: "workspace", version: "1.0", icon: "folder", status: "catalog_addable", tool_type: "mcp", transport_type: "stdio",
      config_fields: [], required_secrets: [], operations: ["Read files"], setup_instructions: ["Install separately and allow a disposable directory only"],
      source_url: "https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md", access_scope: ["May read and write within allowed directories"],
    }])
    render(<MemoryRouter><ToolsPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Configure" }))
    expect(screen.getByText("Read and write files inside configured allowed directories")).toBeInTheDocument()
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("modelcontextprotocol"))
    expect(screen.getByRole("button", { name: "Configure MCP" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Test Connection" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add Tool" })).not.toBeInTheDocument()
  })

  it("shows per-card testing state and a clear MCP success", async () => {
    let resolveTest!: (value: unknown) => void
    mocks.testTool.mockReturnValue(new Promise((resolve) => { resolveTest = resolve }))
    const tool = await renderPage()
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }))
    expect(screen.getByRole("button", { name: "Testing…" })).toBeDisabled()
    resolveTest({ tool: { ...tool, status: "connected", last_checked_at: "2026-01-01T00:01:00Z" }, message: "Tool connection succeeded" })
    expect(await screen.findAllByText("MCP connection successful — Filesystem")).toHaveLength(2)
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("shows a human-readable MCP connection failure and backend reason", async () => {
    const tool = await renderPage()
    mocks.testTool.mockResolvedValue({ tool: { ...tool, status: "error", last_error: "MCP server failed to start" }, message: "MCP server failed to start" })
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }))
    expect(await screen.findAllByText("MCP connection failed: MCP server failed to start")).toHaveLength(2)
    expect(screen.getByText("Error")).toBeInTheDocument()
  })

  it("calls real discovery API and opens the result dialog", async () => {
    const tool = await renderPage()
    mocks.discoverTool.mockResolvedValue({ tool: { ...tool, status: "connected", discovered_tools: [discovered] }, tools: [discovered] })
    fireEvent.click(screen.getByRole("button", { name: "Discover Tools" }))
    expect(await screen.findByText("Filesystem · MCP Tools")).toBeInTheDocument()
    expect(screen.getByText("read_text_file")).toBeInTheDocument()
    expect(screen.getByText("Read text from a file.")).toBeInTheDocument()
    expect(mocks.discoverTool).toHaveBeenCalledWith("tool-1")
  })

  it("opens the dialog for a successful zero-result discovery", async () => {
    const tool = await renderPage()
    mocks.discoverTool.mockResolvedValue({ tool: { ...tool, status: "connected" }, tools: [] })
    fireEvent.click(screen.getByRole("button", { name: "Discover Tools" }))
    expect(await screen.findByText("No MCP tools were discovered from this server.")).toBeInTheDocument()
  })

  it("shows discovery errors without opening a fake result dialog", async () => {
    const tool = await renderPage()
    mocks.discoverTool.mockRejectedValue(new Error("MCP server unavailable"))
    mocks.getTool.mockResolvedValue({ ...tool, status: "error" })
    fireEvent.click(screen.getByRole("button", { name: "Discover Tools" }))
    expect(await screen.findAllByText("Unable to discover MCP tools: MCP server unavailable")).toHaveLength(2)
    expect(screen.queryByText("Filesystem · MCP Tools")).not.toBeInTheDocument()
  })

  it("leaves HTTP Tool actions unchanged and omits MCP discovery", async () => {
    await renderPage(connection({ name: "Status API", tool_type: "http_api", transport_type: null, status: "connected" }))
    expect(screen.getByRole("button", { name: "Test Connection" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Test Execute" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Discover Tools" })).not.toBeInTheDocument()
  })
})
