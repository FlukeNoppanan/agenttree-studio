import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConnectTab } from "@/components/tree/connect-tab"
import { apiExamples, integrationOrigin } from "@/components/tree/api-examples"
import { TreeDetailPage } from "@/pages/trees/tree-detail"
import { api, type TreeDetail } from "@/lib/api"

const auth = vi.hoisted(() => ({ can: vi.fn<(permission: string) => boolean>(() => true) }))
vi.mock("@/auth", () => ({ useAuth: () => ({ can: auth.can }) }))
vi.mock("@/components/tree/agent-hierarchy", () => ({ AgentHierarchy: () => null }))
vi.mock("@/components/test-run-dialog", () => ({ TestRunDialog: () => null }))

const tree = { id: "tree-123", name: "Ready Tree", status: "ready", description: "",
  updated_at: "2026-10-01", created_at: "2026-10-01", provider_usage: [],
  version: { id: "version-1", version_number: 1, status: "ready", agents: [], tool_assignments: [], trigger: null },
} as unknown as TreeDetail

beforeEach(() => {
  auth.can.mockReturnValue(true)
  vi.spyOn(api, "integrationConfig").mockResolvedValue({ public_origin: "https://studio.example.com" })
  vi.spyOn(api, "listDestinations").mockResolvedValue([])
  vi.spyOn(api, "listSecrets").mockResolvedValue([])
  vi.spyOn(api, "listWebhooks").mockResolvedValue([])
})
afterEach(() => vi.restoreAllMocks())

describe("Tree Connect", () => {
  it("recommends async first, preserves sync, uses the Tree ID and existing Account link", async () => {
    render(<MemoryRouter><ConnectTab tree={tree} /></MemoryRouter>)
    await screen.findByText("Async API · Recommended")
    const headings = screen.getAllByRole("heading").map(item => item.textContent)
    expect(headings.indexOf("Async API · Recommended")).toBeLessThan(headings.indexOf("Simple synchronous API"))
    expect(screen.getByRole("link", { name: "Manage API Keys" })).toHaveAttribute("href", "/account?section=api-keys")
    const asyncTabs = screen.getByRole("tablist", { name: "Async API examples" })
    const panels = screen.getAllByRole("tabpanel")
    expect(panels[0]).toHaveTextContent("https://studio.example.com/api/v2/runs")
    expect(panels[0]).toHaveTextContent('"tree_id": "tree-123"')
    expect(panels[1]).toHaveTextContent("https://studio.example.com/api/v1/trees/tree-123/invoke")
    for (const language of ["Python", "JavaScript", "cURL"]) {
      fireEvent.click(within(asyncTabs).getByRole("tab", { name: language }))
      expect(screen.getAllByRole("tabpanel")[0]).toHaveTextContent("AGENTTREE_API_KEY")
    }
    expect(document.body.textContent).not.toContain("backend:8000")
    expect(document.body.textContent).not.toMatch(/ats_[A-Za-z0-9_-]+/)
  })

  it("exposes Connect on a Ready Tree and restores it from the URL on reload", async () => {
    vi.spyOn(api, "getTree").mockResolvedValue(tree)
    vi.spyOn(api, "listTools").mockResolvedValue([])
    vi.spyOn(api, "listTreeRuns").mockResolvedValue([])
    vi.spyOn(api, "listProviders").mockResolvedValue([])
    render(<MemoryRouter initialEntries={["/trees/tree-123?tab=connect"]}><Routes><Route path="/trees/:treeId" element={<TreeDetailPage />} /></Routes></MemoryRouter>)
    await screen.findByText("Async API · Recommended")
    expect(screen.getByRole("button", { name: "Connect" })).toHaveAttribute("aria-pressed", "true")
  })

  it("uses browser origin behind the proxy and rejects internal hostnames", () => {
    expect(integrationOrigin(null, "http://192.168.1.2:5173")).toBe("http://192.168.1.2:5173")
    expect(integrationOrigin("http://backend:8000", "https://studio.example")).not.toContain("backend")
    for (const asyncApi of [true, false]) {
      const result = apiExamples("https://public.example", tree.id, asyncApi)
      for (const example of Object.values(result.examples)) {
        expect(example).toContain("AGENTTREE_API_KEY")
        expect(example).not.toContain("ats_")
        expect(example).not.toContain("\n+")
      }
    }
  })

  it("keeps ingress secrets out of metadata and clears the once-visible value", async () => {
    vi.spyOn(api, "createWebhook").mockResolvedValue({ id: "wh_test", tree_id: tree.id, name: "Events", enabled: true,
      created_at: "2026-10-01", last_received_at: null, secret: "athw_once_visible" })
    render(<MemoryRouter><ConnectTab tree={tree} /></MemoryRouter>)
    await screen.findByText("No webhook configured")
    fireEvent.change(screen.getByRole("textbox", { name: "Webhook name" }), { target: { value: "Events" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Webhook" }))
    await screen.findByText("athw_once_visible")
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByText("athw_once_visible")).not.toBeInTheDocument()
    expect(screen.getByText("Events · Active")).toBeInTheDocument()
    expect(screen.getByText("https://studio.example.com/api/webhooks/wh_test")).toBeInTheDocument()
  })
})
it("opens Connect for Tree managers without requesting forbidden resource lists", async () => {
  auth.can.mockImplementation(permission => ["manage_trees_agents", "use_trees"].includes(permission))
  vi.spyOn(api, "getTree").mockResolvedValue(tree)
  const tools = vi.spyOn(api, "listTools")
  const runs = vi.spyOn(api, "listTreeRuns")
  const providers = vi.spyOn(api, "listProviders")
  render(<MemoryRouter initialEntries={["/trees/tree-123?tab=connect"]}><Routes><Route path="/trees/:treeId" element={<TreeDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByText("Async API · Recommended")
  expect(tools).not.toHaveBeenCalled(); expect(runs).not.toHaveBeenCalled(); expect(providers).not.toHaveBeenCalled()
  expect(api.listSecrets).not.toHaveBeenCalled()
  expect(screen.queryByRole("button", { name: "Live View" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Runs" })).not.toBeInTheDocument()
})
