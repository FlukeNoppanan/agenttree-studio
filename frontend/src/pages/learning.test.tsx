import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider } from "@/auth"
import { Sidebar } from "@/components/sidebar"
import i18n from "@/i18n"
import { api, type StudioUser } from "@/lib/api"
import { LearningPage } from "@/pages/learning"

const member: StudioUser = { id: "normal-user", username: "member", is_admin: false, is_primary_admin: false,
  is_active: true, must_change_password: false, permissions: ["use_trees"], allowed_tree_ids: [],
  tree_access_mode: "selected", created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null }

describe("Learning roadmap placeholder", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en") })

  it("shows a conceptual future flow and makes no learning API calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    render(<LearningPage />)
    expect(screen.getByText("Adaptive intelligence from AgentTree execution experience.")).toBeInTheDocument()
    expect(screen.getAllByText("Coming Soon")).toHaveLength(5)
    expect(screen.getAllByText("Template Adaptation")).toHaveLength(2)
    expect(screen.getByText(/does not currently learn from Runs/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("shows Learning in navigation to normal users and renders Thai copy", async () => {
    vi.spyOn(api, "me").mockResolvedValue(member)
    render(<AuthProvider><MemoryRouter initialEntries={["/learning"]}><Sidebar /></MemoryRouter></AuthProvider>)
    expect(await screen.findAllByRole("link", { name: /Learning.*Coming Soon/ })).toHaveLength(2)
    await i18n.changeLanguage("th")
    render(<LearningPage />)
    expect(screen.getAllByRole("link", { name: /Learning/ })).toHaveLength(2)
    expect(screen.getAllByText("การเรียนรู้")).toHaveLength(1) // existing placeholder content stays untouched
    expect(screen.getAllByText("เร็ว ๆ นี้").length).toBeGreaterThanOrEqual(6)
  })
})
