import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider, ProtectedRoute } from "@/auth"
import i18n from "@/i18n"
import { api, ApiError, type StudioUser } from "@/lib/api"
import { ChangePasswordPage, LoginPage } from "@/pages/auth-pages"
import { AccountPage } from "@/pages/account-page"
import { Sidebar } from "@/components/sidebar"

const member: StudioUser = { id: "u1", username: "member", is_admin: false, is_primary_admin: false, is_active: true,
  must_change_password: false, permissions: ["use_trees"], allowed_tree_ids: ["tree-1"], tree_access_mode: "selected",
  created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null }

function renderRoutes(start = "/") {
  return render(<AuthProvider><MemoryRouter initialEntries={[start]}><Routes>
    <Route path="login" element={<LoginPage />} />
    <Route path="change-password" element={<ChangePasswordPage />} />
    <Route element={<ProtectedRoute />}><Route path="account" element={<AccountPage />} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/" element={<><Sidebar /><p>Studio content</p></>} /></Route>
    <Route element={<ProtectedRoute permission="manage_secrets" />}><Route path="secrets" element={<p>Secret content</p>} /></Route>
  </Routes></MemoryRouter></AuthProvider>)
}

describe("Studio authentication UI", () => {
  beforeEach(async () => { await i18n.changeLanguage("en") })
  afterEach(() => vi.restoreAllMocks())

  it("sends an unauthenticated visitor to Login and shows generic invalid credentials", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new Error("401"))
    vi.spyOn(api, "login").mockRejectedValue(new Error("401"))
    renderRoutes()
    expect(await screen.findByRole("button", { name: "Sign In" })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password")
  })

  it("distinguishes account rate limiting from bad credentials", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new Error("401"))
    vi.spyOn(api, "login").mockRejectedValue(new ApiError("Too many attempts", 429))
    renderRoutes("/login")
    await screen.findByRole("button", { name: "Sign In" })
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in attempts")
  })

  it("logs in and filters navigation and routes by permission", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new Error("401"))
    vi.spyOn(api, "login").mockResolvedValue(member)
    renderRoutes("/login")
    await screen.findByRole("button", { name: "Sign In" })
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "valid" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(await screen.findByText("Studio content")).toBeInTheDocument()
    expect(screen.queryByText("My Trees")).not.toBeInTheDocument()
    expect(screen.queryByText("Security Events")).not.toBeInTheDocument()
    expect(screen.queryByText("Users")).not.toBeInTheDocument()
    expect(screen.queryByText("Secrets")).not.toBeInTheDocument()
  })

  it("denies an inaccessible route and shows User Management to Admin", async () => {
    vi.spyOn(api, "me").mockResolvedValue(member)
    renderRoutes("/secrets")
    expect(await screen.findByText("Access Denied")).toBeInTheDocument()
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument()
  })

  it("shows Admin navigation and signs out to Login", async () => {
    vi.spyOn(api, "me").mockResolvedValue({ ...member, is_admin: true })
    vi.spyOn(api, "logout").mockResolvedValue()
    renderRoutes("/")
    expect(await screen.findByText("Studio content")).toBeInTheDocument()
    expect(screen.getAllByText("Users").length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole("button", { name: "Account menu" })[0])
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign Out" }))
    expect(await screen.findByRole("button", { name: "Sign In" })).toBeInTheDocument()
  })

  it("forces first password change", async () => {
    vi.spyOn(api, "me").mockResolvedValue({ ...member, must_change_password: true })
    vi.spyOn(api, "changePassword").mockResolvedValue(member)
    renderRoutes()
    expect(await screen.findByText("You must change your password before continuing")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "oldpassword123" } })
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "newpassword123" } })
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "newpassword123" } })
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith("oldpassword123", "newpassword123"))
    expect(await screen.findByText("Studio content")).toBeInTheDocument()
  })

  it("shows only granted Trees within Account and localizes the access tab in Thai", async () => {
    await i18n.changeLanguage("th")
    vi.spyOn(api, "me").mockResolvedValue(member)
    vi.spyOn(api, "account").mockResolvedValue({ user: member, session_expires_at: null, allowed_trees: [{ id: "tree-1", name: "Allowed" }], active_token_count: 0 })
    render(<AuthProvider><MemoryRouter><AccountPage /></MemoryRouter></AuthProvider>)
    fireEvent.click(await screen.findByRole("tab", { name: "สิทธิ์เข้าถึง Tree" }))
    expect(await screen.findByText("Allowed")).toBeInTheDocument()
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "บัญชีของฉัน" })).toBeInTheDocument()
  })
})
