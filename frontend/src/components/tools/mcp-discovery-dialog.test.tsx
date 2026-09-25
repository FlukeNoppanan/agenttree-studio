import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AgentTreeLogoIcon } from "@/components/agenttree-mark"
import { McpDiscoveryDialog } from "@/components/tools/mcp-discovery-dialog"
import type { DiscoveredTool } from "@/lib/api"

const tools: DiscoveredTool[] = [
  {
    name: "fetch",
    description: "Fetches content from a URL.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        max_length: { type: "integer", description: "Maximum response length" },
      },
      required: ["url"],
    },
    metadata: {},
    selected: false,
  },
  {
    name: "list_directory",
    description: "List files and directories.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    metadata: {},
    selected: false,
  },
]

describe("McpDiscoveryDialog", () => {
  it("renders real discovery details, readable inputs, raw schema, and a scrollable body", () => {
    render(<McpDiscoveryDialog connectionName="Filesystem" tools={tools} open onOpenChange={() => undefined} />)
    expect(screen.getByText("Filesystem · MCP Tools")).toBeInTheDocument()
    expect(screen.getByText("fetch")).toBeInTheDocument()
    expect(screen.getByText("Fetches content from a URL.")).toBeInTheDocument()
    expect(screen.getByText("url")).toBeInTheDocument()
    expect(screen.getByText("Maximum response length")).toBeInTheDocument()
    expect(screen.getAllByText("Required")).toHaveLength(2)
    expect(screen.getAllByText("View raw schema")).toHaveLength(2)
    expect(screen.getByTestId("mcp-discovery-scroll")).toHaveClass("overflow-y-auto")
  })

  it("filters tools by name, description, or schema", () => {
    render(<McpDiscoveryDialog connectionName="Filesystem" tools={tools} open onOpenChange={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Search tools…"), { target: { value: "directory" } })
    expect(screen.getByText("list_directory")).toBeInTheDocument()
    expect(screen.queryByText("fetch")).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Search tools…"), { target: { value: "missing" } })
    expect(screen.getByText("No tools match this search.")).toBeInTheDocument()
  })

  it("shows the real zero-result state", () => {
    render(<McpDiscoveryDialog connectionName="Empty MCP" tools={[]} open onOpenChange={() => undefined} />)
    expect(screen.getByText("No MCP tools were discovered from this server.")).toBeInTheDocument()
  })

  it("renders the tree-shaped AgentTree brand SVG", () => {
    render(<AgentTreeLogoIcon />)
    const logo = screen.getByRole("img", { name: "AgentTree" })
    expect(logo.tagName.toLowerCase()).toBe("svg")
    expect(logo.querySelectorAll("path").length).toBeGreaterThanOrEqual(2)
  })
})
