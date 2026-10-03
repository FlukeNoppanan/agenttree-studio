import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useLocation, MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ResourceDependencyDialog } from "@/components/resource-dependency-dialog"
import i18n from "@/i18n"
import { ApiError, type ResourceDependencies, type ResourceDependency } from "@/lib/api"

const base = { type: "provider" as const, id: "provider-1", name: "Gemini Production" }

function inspection(dependencies: ResourceDependency[] = []): ResourceDependencies {
  return { resource: base, can_delete: dependencies.length === 0, dependencies }
}

function dependency(overrides: Partial<ResourceDependency> = {}): ResourceDependency {
  return {
    type: "agent", id: "agent-1", name: "Network Specialist", relation: "uses_provider",
    tree_id: "tree-1", tree_name: "IT Helpdesk", tree_version: 1,
    agent_id: "agent-1", agent_name: "Network Specialist", agent_type: "specialist",
    model_id: "gemini-flash", capabilities: [], ...overrides,
  }
}

function Location() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function show(resource: { type: "secret" | "provider" | "tool"; id: string; name: string } = base, inspect = vi.fn().mockResolvedValue(inspection()), remove = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(<MemoryRouter><Location /><ResourceDependencyDialog resource={resource} inspect={inspect} remove={remove} onClose={onClose} onDeleted={onDeleted} /></MemoryRouter>)
  return { inspect, remove, onClose, onDeleted }
}

describe("dependency-aware deletion dialog", () => {
  beforeEach(async () => { await i18n.changeLanguage("en") })
  afterEach(() => vi.clearAllMocks())

  it("confirms an unreferenced resource and deletes only after a fresh check", async () => {
    const calls = show()
    expect(await screen.findByText("No active dependencies were found. This deletion cannot be undone.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(calls.remove).toHaveBeenCalledWith("provider-1"))
    expect(calls.inspect).toHaveBeenCalledTimes(2)
    expect(calls.onDeleted).toHaveBeenCalled()
  })

  it("blocks provider deletion, identifies Tree/Agent/model, and navigates to Tree", async () => {
    const calls = show(base, vi.fn().mockResolvedValue(inspection([dependency()])))
    expect(await screen.findByText("IT Helpdesk", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("Specialist: Network Specialist")).toBeInTheDocument()
    expect(screen.getByText("Model: gemini-flash")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Tree" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/trees/tree-1")
    expect(calls.remove).not.toHaveBeenCalled()
  })

  it("shows a Secret's Provider dependency without revealing a value", async () => {
    const resource = { type: "secret" as const, id: "secret-1", name: "GEMINI_API_KEY" }
    const used = dependency({ type: "provider", id: "provider-1", name: "Gemini Production", tree_id: null, tree_name: null, agent_id: null, agent_name: null, model_id: null, capabilities: [] })
    show(resource, vi.fn().mockResolvedValue({ resource, can_delete: false, dependencies: [used] }))
    expect(await screen.findByText("Provider: Gemini Production")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Provider" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/providers?focus=provider-1")
  })

  it("shows Tool assignment with Specialist and Capability", async () => {
    const resource = { type: "tool" as const, id: "tool-1", name: "Filesystem" }
    show(resource, vi.fn().mockResolvedValue({ resource, can_delete: false, dependencies: [dependency({ relation: "assigned_to_specialist", capabilities: ["code-editing"], model_id: null })] }))
    expect(await screen.findByText("Specialist: Network Specialist")).toBeInTheDocument()
    expect(screen.getByText("Capabilities: code-editing")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
  })

  it("refreshes dependencies after a deletion conflict", async () => {
    const inspect = vi.fn().mockResolvedValueOnce(inspection()).mockResolvedValueOnce(inspection()).mockResolvedValueOnce(inspection([dependency()]))
    const remove = vi.fn().mockRejectedValue(new ApiError("conflict", 409))
    show(base, inspect, remove)
    expect(await screen.findByText("No active dependencies were found. This deletion cannot be undone.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(await screen.findByText("Specialist: Network Specialist")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Dependencies changed")
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
  })

  it("renders the Thai guidance", async () => {
    await i18n.changeLanguage("th")
    show(base, vi.fn().mockResolvedValue(inspection([dependency()])))
    expect(await screen.findByText("ลบ Provider ไม่ได้")).toBeInTheDocument()
    expect(screen.getByText(/โปรดเปลี่ยน Provider และ Model ของ Agent ก่อนลบ/)).toBeInTheDocument()
  })
})
