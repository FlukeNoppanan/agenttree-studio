import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import i18n from "@/i18n"
import { api, type SecurityEventPage } from "@/lib/api"
import { SecurityEventsPage } from "@/pages/security-events"

const first: SecurityEventPage = { page: 1, page_size: 25, total: 26, event_types: ["user_created", "login_failed"], items: [
  { id: "e1", event_type: "user_created", actor_username: "admin", subject_user_id: "u1", created_at: "2026-09-25T00:00:00Z" },
] }
const second: SecurityEventPage = { ...first, page: 2, items: [
  { id: "e2", event_type: "login_failed", actor_username: null, subject_user_id: null, created_at: "2026-09-24T00:00:00Z" },
] }

describe("Security Events page", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en") })

  it("uses server-side pages and preserves filters while paging", async () => {
    const list = vi.spyOn(api, "listSecurityEvents").mockImplementation(async filters => filters?.page === 2 ? second : first)
    render(<SecurityEventsPage />)
    expect(await screen.findByRole("button", { name: "View details: User created" })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Actor"), { target: { value: "admin" } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ actor: "admin", page: 1 })))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ actor: "admin", page: 2, page_size: 25 }))
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument()
  })

  it("filters by real event type and opens safe event metadata", async () => {
    const list = vi.spyOn(api, "listSecurityEvents").mockResolvedValue(first)
    render(<SecurityEventsPage />)
    expect(await screen.findByRole("button", { name: "View details: User created" })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Event"), { target: { value: "user_created" } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ event_type: "user_created", page: 1 })))
    fireEvent.click(screen.getByRole("button", { name: "View details: User created" }))
    expect(await screen.findByText("Event details")).toBeInTheDocument()
    expect(screen.getByText("e1")).toBeInTheDocument()
    expect(screen.queryByText(/password_hash|token_hash/)).not.toBeInTheDocument()
  })
})
