import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ToolsPage } from "@/pages/tools"
import type { ToolConnection, ToolPackage } from "@/lib/api"

const mocks = vi.hoisted(() => ({
  listTools: vi.fn(), listSecrets: vi.fn(), listTrees: vi.fn(), listToolCatalog: vi.fn(),
  testToolPackage: vi.fn(), createToolFromPackage: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: mocks }))

const packageItem: ToolPackage = {
  id: "web-api-request", name: "Web/API Request", description: "Call a documented HTTP API.", category: "web",
  version: "1.0.0", icon: "globe", status: "ready", tool_type: "http_api", transport_type: null,
  config_fields: [], required_secrets: [], operations: ["HTTP request"], setup_instructions: [],
}
const tool: ToolConnection = {
  id: "new-tool", name: "Status API", tool_type: "http_api", description: "", enabled: true,
  secret_id: null, transport_type: null, status: "connected", configuration: { url: "https://api.example.test" },
  discovered_tools: [], assigned_agents_count: 0, last_checked_at: null, last_error: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
}

describe("Tool Catalog setup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTools.mockResolvedValue([]); mocks.listSecrets.mockResolvedValue([]); mocks.listTrees.mockResolvedValue([])
    mocks.listToolCatalog.mockResolvedValue([packageItem])
  })

  it("requires a successful preflight test before creating the existing ToolConnection", async () => {
    mocks.testToolPackage.mockResolvedValue({ success: true, message: "Connection test succeeded" })
    mocks.createToolFromPackage.mockResolvedValue({ tool, message: "Tool connection succeeded" })
    render(<MemoryRouter><ToolsPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Configure" }))
    fireEvent.change(screen.getByLabelText("Endpoint URL"), { target: { value: "https://api.example.test/health" } })
    expect(screen.getByRole("button", { name: "Add Tool" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }))
    expect(await screen.findByText("Connection test succeeded")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add Tool" }))
    expect(await screen.findByText("Status API")).toBeInTheDocument()
    expect(mocks.createToolFromPackage).toHaveBeenCalledWith("web-api-request", expect.objectContaining({ url: "https://api.example.test/health" }))
  })

  it("shows packages marked Coming Soon as unavailable", async () => {
    mocks.listToolCatalog.mockResolvedValue([{ ...packageItem, id: "database-access", name: "Database", status: "coming_soon" }])
    render(<MemoryRouter><ToolsPage /></MemoryRouter>)
    expect(await screen.findByText("Database")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Coming Soon" })).toBeDisabled()
  })
})
