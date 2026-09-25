import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import i18n from "@/i18n"
import { api, type ProviderConnection, type ProviderModel } from "@/lib/api"
import { ProvidersPage } from "@/pages/providers"

function provider(id: string, name: string): ProviderConnection {
  return { id, name, provider_type: "gemini", secret_id: null, base_url: null, status: "connected",
    last_checked_at: null, last_error: null, models_count: 1, discovered_models_count: 3,
    unavailable_models_count: 1, transient_models_count: 1, created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z" }
}
function model(id: string, qualification_status: ProviderModel["qualification_status"]): ProviderModel {
  return { id, provider_connection_id: "gemini", model_id: id.toLowerCase().replaceAll(" ", "-"), display_name: id,
    metadata: null, is_available: qualification_status === "qualified", generation_candidate: true,
    qualification_status, qualification_checked_at: null, qualification_error_code: null,
    qualification_message: null, discovered_at: "2026-09-24T00:00:00Z" }
}
const providers = [provider("gemini", "Gemini Main"), provider("openai", "OpenAI Main")]
const allModels = [model("Ready Alpha", "qualified"), model("Unavailable Beta", "unavailable"), model("Transient Gamma", "transient_error")]
const row = (id: string) => document.getElementById(`provider-${id}`) as HTMLElement

describe("Provider model visibility", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    vi.spyOn(api, "listProviders").mockResolvedValue(providers)
    vi.spyOn(api, "listSecrets").mockResolvedValue([])
    vi.spyOn(api, "listModels").mockResolvedValue(allModels)
    vi.spyOn(api, "discoverModels").mockResolvedValue({ provider: { ...providers[0], models_count: 1 }, models: allModels,
      summary: { discovered_count: 3, candidate_count: 3, usable_count: 1, unavailable_count: 1, transient_error_count: 1 } })
  })

  it("starts collapsed, toggles one Provider without mutation, and shows only ready models", async () => {
    const mutations = [vi.spyOn(api, "deleteProvider"), vi.spyOn(api, "updateProvider")]
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    expect(await screen.findByText("Gemini Main")).toBeInTheDocument()
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
    expect(api.listModels).not.toHaveBeenCalled()
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "View Models" }))
    expect(await screen.findByText("Available Models (1)")).toBeInTheDocument()
    expect(screen.getByText("Ready Alpha")).toBeInTheDocument()
    expect(screen.queryByText("Unavailable Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Transient Gamma")).not.toBeInTheDocument()
    expect(within(row("gemini")).getByRole("button", { name: "Hide Models" })).toHaveAttribute("aria-expanded", "true")
    expect(within(row("openai")).getByRole("button", { name: "View Models" })).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Hide Models" }))
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
    expect(api.listModels).toHaveBeenCalledTimes(1)
    mutations.forEach((mutation) => expect(mutation).not.toHaveBeenCalled())
  })

  it("maintains independent expansion for multiple Providers", async () => {
    vi.mocked(api.listModels).mockImplementation(async (id) => id === "openai" ? [{ ...model("OpenAI Ready", "qualified"), provider_connection_id: "openai" }] : allModels)
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "View Models" }))
    await screen.findByText("Ready Alpha")
    fireEvent.click(within(row("openai")).getByRole("button", { name: "View Models" }))
    expect(await screen.findByText("OpenAI Ready")).toBeInTheDocument()
    expect(screen.getByText("Ready Alpha")).toBeInTheDocument()
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Hide Models" }))
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
    expect(screen.getByText("OpenAI Ready")).toBeInTheDocument()
  })

  it("expands the discovered Provider and refreshes its ready count", async () => {
    vi.mocked(api.discoverModels).mockResolvedValueOnce({ provider: { ...providers[0], models_count: 2 },
      models: [model("Ready Alpha", "qualified"), model("Ready Delta", "qualified"), ...allModels.slice(1)],
      summary: { discovered_count: 4, candidate_count: 4, usable_count: 2, unavailable_count: 1, transient_error_count: 1 } })
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Discover & Verify Models" }))
    expect(await screen.findByText("Ready Alpha")).toBeInTheDocument()
    expect(screen.getByText("Ready Delta")).toBeInTheDocument()
    expect(screen.getByText("Available Models (2)")).toBeInTheDocument()
    expect(within(row("gemini")).getByText("2 ready")).toBeInTheDocument()
    expect(screen.queryByText("Unavailable Beta")).not.toBeInTheDocument()
    expect(screen.getByText(/Discovered 4/)).toBeInTheDocument()
    expect(within(row("gemini")).getByRole("button", { name: "Hide Models" })).toBeInTheDocument()
    expect(within(row("openai")).getByRole("button", { name: "View Models" })).toBeInTheDocument()
    await waitFor(() => expect(api.discoverModels).toHaveBeenCalledWith("gemini"))
  })

  it("uses Thai labels for both toggle states", async () => {
    await i18n.changeLanguage("th")
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "ดูโมเดล" }))
    expect(await screen.findByText("โมเดลที่พร้อมใช้ (1)")).toBeInTheDocument()
    expect(within(row("gemini")).getByRole("button", { name: "ซ่อนโมเดล" })).toBeInTheDocument()
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "ซ่อนโมเดล" }))
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
  })
})
