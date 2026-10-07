import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "@/i18n"
import { api, type ProviderConnection, type ProviderModel } from "@/lib/api"
import { ProviderModelSelector } from "./provider-model-selector"

const connection: ProviderConnection = { id: "provider", name: "Configured Provider", provider_type: "gemini", status: "connected", secret_id: null, base_url: null, models_count: 1, discovered_models_count: 4, unavailable_models_count: 2, transient_models_count: 1, created_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", last_checked_at: null, last_error: null }
const ready: ProviderModel = { id: "ready", provider_connection_id: "provider", model_id: "ready", display_name: "Ready", metadata: null, is_available: true, generation_candidate: true, qualification_status: "qualified", qualification_error_code: null, qualification_message: null, qualification_checked_at: null, discovered_at: "2026-10-02T00:00:00Z" }
const catalog = [ready, { ...ready, id: "embedding", model_id: "embedding", generation_candidate: false }, { ...ready, id: "removed", model_id: "removed", is_available: false }, { ...ready, id: "old", model_id: "old", qualification_status: "transient_error" as const }]

describe("shared Provider/Model eligibility", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en") })

  it("filters diagnostic catalogs and preserves the unavailable binding without replacement", async () => {
    const onModelChange = vi.fn()
    render(<ProviderModelSelector providers={[connection]} modelCatalogs={{ provider: catalog }} providerId="provider" modelId="old" onProviderChange={vi.fn()} onModelChange={onModelChange} />)
    const select = await screen.findByRole("combobox", { name: "Model" })
    expect(within(select).getByRole("option", { name: /Ready/ })).toHaveValue("ready")
    expect(within(select).queryByRole("option", { name: /embedding|removed/ })).not.toBeInTheDocument()
    expect(within(select).getByRole("option", { name: /old/ })).toBeDisabled()
    expect(select).toHaveValue("old")
    expect(onModelChange).not.toHaveBeenCalled()
    fireEvent.change(select, { target: { value: "ready" } })
    expect(onModelChange).toHaveBeenCalledWith("ready")
  })

  it("uses the normal filtered models API and shows retry guidance when none qualify", async () => {
    vi.spyOn(api, "listModels").mockResolvedValue(catalog.slice(1))
    render(<ProviderModelSelector providers={[connection]} providerId="provider" modelId={null} onProviderChange={vi.fn()} onModelChange={vi.fn()} />)
    expect(await screen.findByText(i18n.t("uiCopy.noVerifiedModelsHelp"))).toBeInTheDocument()
    expect(api.listModels).toHaveBeenCalledWith("provider", true)
    expect(screen.getByRole("combobox", { name: "Model" })).toBeDisabled()
  })

  it("keeps technical vocabulary in Thai", async () => {
    await i18n.changeLanguage("th")
    render(<ProviderModelSelector providers={[connection]} modelCatalogs={{ provider: catalog }} providerId="provider" modelId="ready" onProviderChange={vi.fn()} onModelChange={vi.fn()} />)
    expect(await screen.findByRole("combobox", { name: "Model" })).toHaveValue("ready")
    expect(screen.queryByRole("option", { name: /embedding|removed|old/ })).not.toBeInTheDocument()
  })
})
