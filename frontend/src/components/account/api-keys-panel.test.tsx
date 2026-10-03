import { MemoryRouter } from "react-router-dom"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKeysPanel } from "@/components/account/api-keys-panel"
import i18n from "@/i18n"
import { api } from "@/lib/api"

describe("Account API Keys", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await i18n.changeLanguage("en")
    vi.spyOn(api, "listTokens").mockResolvedValue([])
  })

  it("creates a named key, copies it, hides/shows it, and forgets plaintext on Done", async () => {
    const create = vi.spyOn(api, "createToken").mockResolvedValue({ id: "key-1", name: "Coding IDE", token: "ats_once_only", created_at: "2026-09-25T00:00:00Z" })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<MemoryRouter><ApiKeysPanel enabled /></MemoryRouter>)
    expect(await screen.findByText("You haven't created any API keys yet.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Create API Key" }))
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "  Coding IDE  " } })
    fireEvent.click(screen.getByRole("dialog").querySelector('button[type="submit"]')!)
    await waitFor(() => expect(create).toHaveBeenCalledWith("Coding IDE"))
    expect(await screen.findByText("ats_once_only")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Trees → Connect" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Getting Started" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Hide" }))
    expect(screen.queryByText("ats_once_only")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy API Key" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ats_once_only"))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByText("ats_once_only")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Create API Key" }))
    expect(screen.queryByText("ats_once_only")).not.toBeInTheDocument()
  })

  it("lists metadata only and requires confirmation to revoke", async () => {
    vi.spyOn(api, "listTokens").mockResolvedValue([{ id: "key-1", name: "CLI", created_at: "2026-09-25T00:00:00Z" }])
    const revoke = vi.spyOn(api, "revokeToken").mockResolvedValue()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<MemoryRouter><ApiKeysPanel enabled /></MemoryRouter>)
    expect(await screen.findByText("CLI")).toBeInTheDocument()
    expect(screen.queryByText(/ats_/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Revoke API Key" }))
    expect(revoke).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole("button", { name: "Revoke API Key" }))
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("key-1"))
    expect(await screen.findByText("You haven't created any API keys yet.")).toBeInTheDocument()
  })

  it("falls back to a temporary copy control when Clipboard API is denied", async () => {
    vi.spyOn(api, "createToken").mockResolvedValue({ id: "key-2", name: "Laptop", token: "ats_fallback", created_at: "2026-09-25T00:00:00Z" })
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn().mockReturnValue(true) })
    render(<MemoryRouter><ApiKeysPanel enabled /></MemoryRouter>)
    await screen.findByText("You haven't created any API keys yet.")
    fireEvent.click(screen.getByRole("button", { name: "Create API Key" }))
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Laptop" } })
    fireEvent.click(screen.getByRole("dialog").querySelector('button[type="submit"]')!)
    await screen.findByText("ats_fallback")
    fireEvent.click(screen.getByRole("button", { name: "Copy API Key" }))
    expect(await screen.findByText("API key copied.")).toBeInTheDocument()
    expect(document.execCommand).toHaveBeenCalledWith("copy")
    expect(document.querySelector("textarea")).toBeNull()
  })

  it("does not request or create keys without Tree permission and uses Thai labels", async () => {
    await i18n.changeLanguage("th")
    const list = vi.spyOn(api, "listTokens")
    render(<ApiKeysPanel enabled={false} />)
    expect(screen.getByText("API Keys")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "สร้าง API Key" })).not.toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it("uses Thai create, copy and revoke labels for an enabled account", async () => {
    await i18n.changeLanguage("th")
    vi.spyOn(api, "listTokens").mockResolvedValue([{ id: "key-1", name: "CLI", created_at: "2026-09-25T00:00:00Z" }])
    render(<MemoryRouter><ApiKeysPanel enabled /></MemoryRouter>)
    expect(await screen.findByText("CLI")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "สร้าง API Key" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "เพิกถอน API Key" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "สร้าง API Key" }))
    expect(screen.getByText(/สิทธิ์ Tree ปัจจุบัน/)).toBeInTheDocument()
  })
})
