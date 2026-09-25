import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider } from "@/auth"
import { Sidebar } from "@/components/sidebar"
import i18n from "@/i18n"
import { api, type AccountInfo, type DashboardSummary, type MyDashboard, type StudioUser } from "@/lib/api"
import { LoginPage } from "@/pages/auth-pages"
import { AccountPage } from "@/pages/account-page"
import { DashboardPage } from "@/pages/dashboard"
import { UsersPage } from "@/pages/users"

const base: StudioUser = { id: "user-1", username: "user01", is_admin: false, is_primary_admin: false,
  is_active: true, must_change_password: false, permissions: ["use_trees"], allowed_tree_ids: ["tree-1"], tree_access_mode: "selected",
  created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z", last_login_at: "2026-09-25T01:00:00Z" }
const primary = { ...base, id: "admin-1", username: "admin", is_admin: true, is_primary_admin: true, permissions: [] }
const limited: MyDashboard = { trees_count: 1, available_trees: [{ id: "tree-1", name: "Coding Assistant", status: "ready" }],
  providers_count: null, ready_models_count: null, tools_count: null, runs_count: null, recent_runs: [], secrets_count: null }
const global: DashboardSummary = { metrics: {
  trees: { total: 2, ready: 1, draft: 1 }, runs: { total: 3, today: 1, running: 0, completed: 3, failed: 0, success_rate: 100 },
  providers: { total: 1, connected: 1, usable_models: 1 }, tools: { total: 2, connected: 2, enabled: 2 }, users: 4,
}, recent_runs: [], trees: [], providers: [], needs_attention: [] }

function mount(page: "dashboard" | "account" | "users", user: StudioUser) {
  vi.spyOn(api, "me").mockResolvedValue(user)
  return render(<AuthProvider><MemoryRouter initialEntries={[`/${page}`]}><Sidebar /><Routes>
    <Route path="dashboard" element={<DashboardPage />} />
    <Route path="account" element={<AccountPage />} />
    <Route path="users" element={<UsersPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="change-password" element={<p>Change Password page</p>} />
  </Routes></MemoryRouter></AuthProvider>)
}

describe("Primary Admin and account-aware UI", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en") })

  it("keeps forbidden routes out of navigation and marks the active route", async () => {
    vi.spyOn(api, "myDashboard").mockResolvedValue(limited)
    mount("dashboard", base)
    await screen.findByText("Coding Assistant")
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Secrets" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "My Trees" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "My Account" })).not.toBeInTheDocument()
  })

  it("marks a management route active in both responsive navigation variants", async () => {
    vi.spyOn(api, "listUsers").mockResolvedValue([primary])
    vi.spyOn(api, "listTrees").mockResolvedValue([])
    mount("users", primary)
    await screen.findByText("Primary Administrator · Full system access")
    for (const link of screen.getAllByRole("link", { name: "Users" })) expect(link).toHaveAttribute("aria-current", "page")
  })

  it("labels Primary Admin and hides delete/deactivate controls", async () => {
    vi.spyOn(api, "listUsers").mockResolvedValue([primary])
    vi.spyOn(api, "listTrees").mockResolvedValue([])
    mount("users", primary)
    const label = await screen.findByText("Primary Administrator · Full system access")
    expect(label).toBeInTheDocument()
    fireEvent.click(label.closest("button")!)
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Active")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Administrator")).toBeDisabled()
  })

  it("opens the global account menu and signs out from the shell", async () => {
    vi.spyOn(api, "account").mockResolvedValue({ user: base, session_expires_at: "2026-09-25T12:00:00Z", allowed_trees: [{ id: "tree-1", name: "Coding Assistant" }], active_token_count: 0 })
    vi.spyOn(api, "logout").mockResolvedValue()
    mount("account", base)
    await screen.findByRole("heading", { name: "My Account" })
    const menus = screen.getAllByRole("button", { name: "Account menu" })
    expect(menus).toHaveLength(2) // desktop and responsive shell
    fireEvent.click(menus[0])
    expect(screen.getByRole("menuitem", { name: "My Account" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Change Password" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign Out" }))
    await waitFor(() => expect(api.logout).toHaveBeenCalled())
    expect(await screen.findByRole("button", { name: "Sign In" })).toBeInTheDocument()
  })

  it("shows profile, security, scoped grants and token metadata without raw values", async () => {
    const account: AccountInfo = { user: base, session_expires_at: "2026-09-25T12:00:00Z", allowed_trees: [{ id: "tree-1", name: "Coding Assistant" }], active_token_count: 2 }
    vi.spyOn(api, "account").mockResolvedValue(account)
    vi.spyOn(api, "listTokens").mockResolvedValue([{ id: "key-1", name: "Coding IDE", created_at: "2026-09-25T00:00:00Z" }])
    mount("account", base)
    expect(await screen.findByText("Last Login")).toBeInTheDocument()
    for (const label of ["Profile", "Security", "Tree Access", "API Keys"]) expect(screen.getByRole("tab", { name: label })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "Security" }))
    expect(screen.getByText("Session Expires")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "Tree Access" }))
    expect(screen.getByText("Coding Assistant")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "API Keys" }))
    expect(await screen.findByText("Coding IDE")).toBeInTheDocument()
    expect(screen.queryByText("ats_previous_token")).not.toBeInTheDocument()
  })

  it("builds a nonempty use_trees dashboard from granted Trees only", async () => {
    vi.spyOn(api, "myDashboard").mockResolvedValue(limited)
    const globalSpy = vi.spyOn(api, "getDashboardSummary")
    mount("dashboard", base)
    expect(await screen.findByText("Coding Assistant")).toBeInTheDocument()
    expect(screen.getByText("Welcome back, user01")).toBeInTheDocument()
    expect(screen.queryByText("Hidden Tree")).not.toBeInTheDocument()
    expect(screen.queryByText("Create Tree")).not.toBeInTheDocument()
    expect(screen.queryByText("Add Provider")).not.toBeInTheDocument()
    expect(screen.queryByText("My Trees")).not.toBeInTheDocument()
    expect(globalSpy).not.toHaveBeenCalled()
  })

  it("shows a useful no-access state and localized Thai text", async () => {
    await i18n.changeLanguage("th")
    vi.spyOn(api, "myDashboard").mockResolvedValue({ ...limited, trees_count: null, available_trees: [] })
    mount("dashboard", { ...base, permissions: [], allowed_tree_ids: [] })
    expect(await screen.findByText("ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เข้าถึง")).toBeInTheDocument()
    expect(screen.getByText("ยินดีต้อนรับกลับ user01")).toBeInTheDocument()
  })

  it("shows authoritative Admin metrics and Create User action", async () => {
    vi.spyOn(api, "getDashboardSummary").mockResolvedValue(global)
    mount("dashboard", primary)
    expect(await screen.findByText("Studio accounts")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create User" })).toBeInTheDocument()
  })
})
