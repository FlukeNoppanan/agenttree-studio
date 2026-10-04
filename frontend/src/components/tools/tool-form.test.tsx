import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ToolForm } from "@/components/tools/tool-form"
import type { ToolConnection, ToolPayload } from "@/lib/api"

const mocks = vi.hoisted(() => ({ createTool: vi.fn(), updateTool: vi.fn(), discoverTool: vi.fn(), getToolAssignments: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: mocks }))

function saved(payload: Partial<ToolPayload> = {}): ToolConnection {
  return { id: "registered-mcp", name: "Workspace", description: "", tool_type: "mcp", enabled: true,
    secret_id: null, transport_type: "stdio", status: "not_configured", configuration: {},
    discovered_tools: [], assigned_agents_count: 0, last_checked_at: null, last_error: null,
    created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z", ...payload }
}

describe("ToolForm catalog registration identity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createTool.mockImplementation(async (payload: ToolPayload) => saved(payload))
    mocks.updateTool.mockImplementation(async (_id: string, payload: ToolPayload) => saved(payload))
    mocks.discoverTool.mockResolvedValue({ tool: saved(), tools: [] })
    mocks.getToolAssignments.mockResolvedValue({ assignments: [] })
  })

  it("saves an external MCP profile identity with the actual connection configuration", async () => {
    render(<ToolForm open onOpenChange={vi.fn()} tool={null} secrets={[]} specialists={[]} onComplete={vi.fn()} initialType="mcp" catalogPackageId="filesystem-workspace" />)
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Workspace" } })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.change(screen.getByPlaceholderText("python or npx"), { target: { value: "existing-server" } })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(mocks.createTool).toHaveBeenCalledWith(expect.objectContaining({ tool_type: "mcp", configuration: expect.objectContaining({ command: "existing-server", catalog_package_id: "filesystem-workspace" }) })))
    expect(mocks.discoverTool).toHaveBeenCalledWith("registered-mcp")
  })

  it("retains a registered profile when editing the same resource type", async () => {
    const tool = saved({ configuration: { command: "existing-server", catalog_package_id: "filesystem-workspace" } })
    render(<ToolForm open onOpenChange={vi.fn()} tool={tool} secrets={[]} specialists={[]} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(mocks.updateTool).toHaveBeenCalledWith(tool.id, expect.objectContaining({ configuration: expect.objectContaining({ catalog_package_id: "filesystem-workspace" }) })))
  })

  it("does not assign an MCP profile to a different selected Tool type", async () => {
    render(<ToolForm open onOpenChange={vi.fn()} tool={null} secrets={[]} specialists={[]} onComplete={vi.fn()} initialType="mcp" catalogPackageId="filesystem-workspace" />)
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "HTTP check" } })
    fireEvent.click(screen.getByRole("button", { name: /HTTP API/ }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(mocks.createTool).toHaveBeenCalled())
    const payload = mocks.createTool.mock.calls[0][0] as ToolPayload
    expect(payload.tool_type).toBe("http_api")
    expect(payload.configuration).not.toHaveProperty("catalog_package_id")
    expect(mocks.discoverTool).not.toHaveBeenCalled()
  })
})
