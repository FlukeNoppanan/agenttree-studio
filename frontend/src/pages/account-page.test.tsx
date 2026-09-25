import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider } from "@/auth"
import i18n from "@/i18n"
import { api, type StudioUser } from "@/lib/api"
import { AccountPage } from "@/pages/account-page"
import { MyTreesRedirect } from "@/pages/legacy-my-trees-redirect"

const member: StudioUser = { id: "u1", username: "member", is_admin: false, is_primary_admin: false, is_active: true,
  must_change_password: false, permissions: ["use_trees"], allowed_tree_ids: ["tree-1"], tree_access_mode: "selected",
  created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null }

function mount(user: StudioUser, start = "/account") {
  vi.spyOn(api, "me").mockResolvedValue(user)
  vi.spyOn(api, "account").mockResolvedValue({ user, session_expires_at: null,
    allowed_trees: user.is_admin || user.permissions.includes("use_trees") ? [{ id: "tree-1", name: "Coding Assistant" }] : [], active_token_count: 0 })
  return render(<AuthProvider><MemoryRouter initialEntries={[start]}><Routes>
    <Route path="/my-trees" element={<MyTreesRedirect />} />
    <Route path="/account" element={<AccountPage />} />
  </Routes></MemoryRouter></AuthProvider>)
}

describe("Account sections and legacy route", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en") })

  it("redirects a bookmarked My Trees route to read-only Tree Access", async () => {
    mount(member, "/my-trees")
    expect(await screen.findByText("Coding Assistant")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Tree Access" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("button", { name: /grant|all trees/i })).not.toBeInTheDocument()
  })

  it("shows Admin access and supports keyboard tab navigation", async () => {
    mount({ ...member, is_admin: true, permissions: [] })
    const profile = await screen.findByRole("tab", { name: "Profile" })
    fireEvent.keyDown(profile, { key: "ArrowLeft" })
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("tab", { name: "Tree Access" }))
    expect(await screen.findByText("Administrator access · All Trees")).toBeInTheDocument()
  })

  it("does not offer API key creation or self-grant to a user without Tree permission", async () => {
    mount({ ...member, permissions: [], allowed_tree_ids: [] }, "/account?section=tree-access")
    expect(await screen.findByText(/Your account cannot use Trees/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "API Keys" }))
    expect(screen.getByText(/API keys are unavailable/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Create API Key" })).not.toBeInTheDocument()
  })
})
