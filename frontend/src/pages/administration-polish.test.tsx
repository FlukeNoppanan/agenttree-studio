import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { api, type SystemHealth } from "@/lib/api"
import { SecretsPage } from "@/pages/secrets"
import { SettingsPage } from "@/pages/settings"

const health: SystemHealth = { status: "ok", studio_api: { available: true, version: "0.1.0", detail: null }, agenttree: { available: true, version: "0.2.2", error: null }, database: { available: true, version: null, detail: "PostgreSQL" }, migrations: { current: "0013", head: "0013", up_to_date: true }, backend_version: "0.1.0", frontend_version: "0.1.0", runtime: { python_version: "3.12", platform: "Linux" } }

beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en") })
describe("scoped administration polish", () => {
  it("renders only masked Secret metadata in the accessible table", async () => {
    vi.spyOn(api, "listSecrets").mockResolvedValue([{ id: "s1", name: "Provider credential", secret_type: "api_key", masked_value: "••••••••", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }])
    render(<MemoryRouter><SecretsPage /></MemoryRouter>)
    expect(await screen.findByRole("table", { name: "Secrets" })).toBeInTheDocument()
    expect(screen.getByText("••••••••")).toBeInTheDocument()
    expect(screen.queryByText("encrypted_value")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("title", "Delete Secret")
  })
  it("keeps creation explicit and clears transient input on cancel", async () => {
    vi.spyOn(api, "listSecrets").mockResolvedValue([])
    const create = vi.spyOn(api, "createSecret")
    render(<MemoryRouter><SecretsPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole("button", { name: "Add Secret" }))
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "synthetic-form-only" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.click(screen.getByRole("button", { name: "Add Secret" }))
    expect(screen.getByLabelText("Value")).toHaveValue("")
    expect(create).not.toHaveBeenCalled()
  })
  it("localizes Secret guidance and controls without translating the product term", async () => {
    await i18n.changeLanguage("th")
    vi.spyOn(api, "listSecrets").mockResolvedValue([])
    render(<MemoryRouter><SecretsPage /></MemoryRouter>)
    expect(screen.getByText(/ค่า Secret จะถูกปิดบัง/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: i18n.t("secrets.add") }))
    expect(screen.getByRole("button", { name: "บันทึก Secret" })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("ชื่อสำหรับอ้างอิง เช่น Provider หลัก")).toBeInTheDocument()
  })
  it("refreshes actual system-health service and switches the existing locale", async () => {
    const get = vi.spyOn(api, "getSystemHealth").mockResolvedValue(health)
    render(<SettingsPage />)
    expect(await screen.findByText("PostgreSQL")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: i18n.t("settings.refresh") }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByRole("combobox", { name: i18n.t("settings.language") }), { target: { value: "th" } })
    await waitFor(() => expect(i18n.language).toBe("th"))
    expect(await screen.findByText("PostgreSQL")).toBeInTheDocument()
  })
})
