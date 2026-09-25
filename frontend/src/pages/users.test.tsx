import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "@/i18n"
import { api, type StudioUser } from "@/lib/api"
import { UsersPage } from "@/pages/users"

const existing: StudioUser = { id: "u1", username: "operator", is_admin: false, is_primary_admin: false, is_active: true,
  must_change_password: true, permissions: [], allowed_tree_ids: [], tree_access_mode: "selected", created_at: "2026-01-01",
  updated_at: "2026-01-01", last_login_at: null }
const tree = { id: "tree-1", name: "Coding Assistant", description: "", status: "ready" as const,
  version_number: 1, managers_count: 0, specialists_count: 0, updated_at: "2026-01-01" }

describe("Account management and API Access UI", () => {
  beforeEach(async () => { await i18n.changeLanguage("en"); vi.restoreAllMocks() })

  it("creates a User with selected permissions and Tree grant", async () => {
    vi.spyOn(api, "listUsers").mockResolvedValue([])
    vi.spyOn(api, "listTrees").mockResolvedValue([tree])
    const create = vi.spyOn(api, "createUser").mockResolvedValue({ ...existing, username: "newmember", permissions: ["use_trees"], allowed_tree_ids: [tree.id] })
    render(<MemoryRouter><UsersPage /></MemoryRouter>)
    await screen.findByText("Tree Access")
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newmember" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "temporary-strong-password" } })
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "temporary-strong-password" } })
    fireEvent.click(screen.getByLabelText("Can use Trees"))
    await screen.findByText("Coding Assistant")
    fireEvent.click(screen.getByLabelText("Coding Assistant"))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ username: "newmember", permissions: ["use_trees"], allowed_tree_ids: [tree.id] })))
  })

  it("edits permissions and Tree grant, while Admin has full access", async () => {
    vi.spyOn(api, "listUsers").mockResolvedValue([existing])
    vi.spyOn(api, "listTrees").mockResolvedValue([tree])
    const update = vi.spyOn(api, "updateUser").mockResolvedValue({ ...existing, permissions: ["manage_tools_mcp", "use_trees"], allowed_tree_ids: [tree.id] })
    render(<MemoryRouter><UsersPage /></MemoryRouter>)
    fireEvent.click(await screen.findByText("operator"))
    fireEvent.click(screen.getByLabelText("Tools & MCP"))
    fireEvent.click(screen.getByLabelText("Can use Trees"))
    fireEvent.click(screen.getByLabelText("Coding Assistant"))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(existing.id, expect.objectContaining({ permissions: ["manage_tools_mcp", "use_trees"], allowed_tree_ids: [tree.id] })))
  })

  it("filters explicit grants and distinguishes Select All Visible from All Trees", async () => {
    vi.spyOn(api, "listUsers").mockResolvedValue([])
    vi.spyOn(api, "listTrees").mockResolvedValue([tree, { ...tree, id: "tree-2", name: "Helpdesk" }])
    const create = vi.spyOn(api, "createUser").mockResolvedValue({ ...existing, username: "newmember" })
    render(<MemoryRouter><UsersPage /></MemoryRouter>)
    await screen.findByText("Tree Access")
    fireEvent.click(screen.getByLabelText("Can use Trees"))
    await screen.findByText("Helpdesk")
    expect(screen.getByLabelText("Selected Trees")).toBeChecked()
    fireEvent.change(screen.getByLabelText("Search Trees"), { target: { value: "Coding" } })
    expect(screen.queryByText("Helpdesk")).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Select All Visible"))
    expect(screen.getByText("Selected: 1 Trees")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("All Trees"))
    expect(screen.getByText("All current and future Trees")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newmember" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "temporary-strong-password" } })
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "temporary-strong-password" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ tree_access_mode: "all", allowed_tree_ids: [tree.id] })))
  })

  it("loads existing All Trees mode and shows Tree access summary", async () => {
    vi.spyOn(api, "listUsers").mockResolvedValue([{ ...existing, permissions: ["use_trees"], tree_access_mode: "all" }])
    vi.spyOn(api, "listTrees").mockResolvedValue([tree])
    const update = vi.spyOn(api, "updateUser").mockResolvedValue({ ...existing, permissions: ["use_trees"] })
    render(<MemoryRouter><UsersPage /></MemoryRouter>)
    expect(await screen.findByText("Tree Access: All Trees")).toBeInTheDocument()
    fireEvent.click(screen.getByText("operator"))
    expect(screen.getByLabelText("All Trees")).toBeChecked()
    fireEvent.click(screen.getByLabelText("Selected Trees"))
    fireEvent.click(screen.getByLabelText("Coding Assistant"))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(existing.id, expect.objectContaining({ tree_access_mode: "selected", allowed_tree_ids: [tree.id] })))
  })

})
