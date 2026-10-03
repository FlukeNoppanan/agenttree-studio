import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import i18n from "@/i18n"
import { api, type ProviderConnection, type ProviderModel } from "@/lib/api"
import { ProvidersPage } from "@/pages/providers"

vi.mock("@/auth", () => ({ useAuth: () => ({ can: () => true }) }))

function provider(id: string, name: string, provider_type: ProviderConnection["provider_type"] = "gemini"): ProviderConnection {
  return { id, name, provider_type, secret_id: null, base_url: null, status: "connected",
    last_checked_at: null, last_error: null, models_count: 1, discovered_models_count: 3,
    unavailable_models_count: 1, transient_models_count: 1, created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z" }
}
function model(id: string, qualification_status: ProviderModel["qualification_status"], providerId = "gemini"): ProviderModel {
  return { id, provider_connection_id: providerId, model_id: id.toLowerCase().replaceAll(" ", "-"), display_name: id,
    metadata: null, is_available: true, generation_candidate: true,
    qualification_status, qualification_checked_at: null, qualification_error_code: null,
    qualification_message: null, discovered_at: "2026-09-24T00:00:00Z" }
}
const providers = [provider("gemini", "Gemini Main"), provider("openai", "OpenAI Main", "openai")]
const allModels = [model("Ready Alpha", "qualified"),
  { ...model("Unavailable Beta", "unavailable"), qualification_message: "No final response was returned" },
  model("Transient Gamma", "transient_error")]
const row = (id: string) => document.getElementById(`provider-${id}`) as HTMLElement
const discovery = (providerItem: ProviderConnection, models: ProviderModel[]) => ({
  provider: providerItem,
  models,
  summary: {
    discovered_count: models.length,
    candidate_count: models.filter((item) => item.is_available && item.generation_candidate).length,
    usable_count: models.filter((item) => item.qualification_status === "qualified").length,
    unavailable_count: models.filter((item) => item.qualification_status === "unavailable").length,
    transient_error_count: models.filter((item) => item.qualification_status === "transient_error").length,
  },
})

describe("Provider onboarding and model visibility", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await i18n.changeLanguage("en")
    vi.spyOn(api, "listProviders").mockResolvedValue(providers)
    vi.spyOn(api, "listSecrets").mockResolvedValue([])
    vi.spyOn(api, "listModels").mockResolvedValue(allModels)
    vi.spyOn(api, "discoverModelCatalog").mockResolvedValue(discovery(providers[0], allModels))
    vi.spyOn(api, "verifyProviderModel").mockImplementation(async (_providerId, modelId) => ({
      provider: { ...providers[0], models_count: 1 },
      model: allModels.find((item) => item.model_id === modelId) ?? model(modelId, "qualified"),
    }))
  })

  it("offers every supported provider type in the create form", async () => {
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Add Provider" }))
    const types = [...(document.getElementById("provider-type") as HTMLSelectElement).options].map((item) => item.value)
    expect(types).toEqual(["openai", "gemini", "groq", "openrouter", "cerebras", "openai_compatible", "ollama"])
  })

  it("shows only usable models while retaining diagnostic data", async () => {
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    expect(await screen.findByText("Gemini Main")).toBeInTheDocument()
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
    expect(api.listModels).not.toHaveBeenCalled()
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "View Models" }))
    expect(await screen.findByText("Usable models (1)")).toBeInTheDocument()
    expect(screen.getByText("Ready Alpha")).toBeInTheDocument()
    expect(screen.queryByText("Unavailable Beta")).not.toBeInTheDocument()
    expect(screen.queryByText("Unavailable — No final response was returned")).not.toBeInTheDocument()
    expect(screen.queryByText("Transient Gamma")).not.toBeInTheDocument()
    expect(within(row("gemini")).getByRole("button", { name: "Hide Models" })).toHaveAttribute("aria-expanded", "true")
    expect(within(row("openai")).getByRole("button", { name: "View Models" })).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Hide Models" }))
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
    expect(api.listModels).toHaveBeenCalledWith("gemini", true)
  })

  it("maintains independent expansion for multiple Providers", async () => {
    vi.mocked(api.listModels).mockImplementation(async (id) => id === "openai"
      ? [{ ...model("OpenAI Ready", "qualified", "openai"), provider_connection_id: "openai" }]
      : allModels)
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

  it("keeps the manual discovery control and verifies models one by one", async () => {
    const catalogModels = [model("Ready Alpha", "unknown"), model("Ready Delta", "unknown"), ...allModels.slice(1)]
    vi.mocked(api.discoverModelCatalog).mockResolvedValueOnce(discovery({ ...providers[0], status: "connected" }, catalogModels))
    vi.mocked(api.verifyProviderModel).mockImplementation(async (id, modelId) => ({
      provider: { ...providers[0], models_count: modelId === "ready-alpha" ? 1 : 2 },
      model: { ...catalogModels.find((item) => item.model_id === modelId)!, qualification_status: "qualified", qualification_message: "Ready to use" },
    }))
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Discover & Verify Models" }))
    expect(await screen.findByText("Usable models (4)")).toBeInTheDocument()
    expect(await screen.findByText("Ready Alpha")).toBeInTheDocument()
    expect(screen.getByText("Ready Delta")).toBeInTheDocument()
    expect(screen.getByText("Unavailable Beta")).toBeInTheDocument()
    await waitFor(() => expect(api.verifyProviderModel).toHaveBeenCalledTimes(4))
    expect(within(row("gemini")).getByText("2 ready")).toBeInTheDocument()
    expect(screen.getByText(/Discovered 4/)).toBeInTheDocument()
  })

  it("automatically tests, discovers, and verifies after saving a new Ollama provider", async () => {
    const callOrder: string[] = []
    const saved = { ...provider("ollama", "Local Ollama", "ollama"), base_url: "http://localhost:11434", status: "not_configured" as const, models_count: 0 }
    const connected = { ...saved, status: "connected" as const }
    const models = [model("gemma4:e4b", "unknown", "ollama"), model("qwen3:1.7b", "unknown", "ollama")]
    vi.spyOn(api, "createProvider").mockImplementation(async () => { callOrder.push("save"); return saved })
    vi.spyOn(api, "testProvider").mockImplementation(async () => { callOrder.push("test"); return connected })
    vi.mocked(api.discoverModelCatalog).mockImplementation(async () => { callOrder.push("discover"); return discovery(connected, models) })
    vi.mocked(api.verifyProviderModel).mockImplementation(async (_id, modelId) => {
      callOrder.push(`verify:${modelId}`)
      return {
        provider: { ...connected, models_count: callOrder.filter((item) => item.startsWith("verify:")).length },
        model: { ...models.find((item) => item.model_id === modelId)!, qualification_status: "qualified", qualification_message: "Ready to use" },
      }
    })

    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Add Provider" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Local Ollama" } })
    fireEvent.change(within(dialog).getByLabelText("Provider type"), { target: { value: "ollama" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add provider" }))

    await screen.findByText("Local Ollama")
    await waitFor(() => expect(within(row("ollama")).getByText("2 ready")).toBeInTheDocument())
    expect(screen.getAllByText("gemma4:e4b")).toHaveLength(2)
    expect(screen.getAllByText("qwen3:1.7b")).toHaveLength(2)
    expect(within(row("ollama")).getByText("Connected")).toBeInTheDocument()
    expect(within(row("ollama")).getByText("2 ready")).toBeInTheDocument()
    expect(callOrder).toEqual(["save", "test", "discover", "verify:gemma4:e4b", "verify:qwen3:1.7b"])
  })

  it("shows each model as verifying before its result arrives", async () => {
    const saved = { ...provider("ollama", "Local Ollama", "ollama"), base_url: "http://localhost:11434", status: "not_configured" as const, models_count: 0 }
    const connected = { ...saved, status: "connected" as const }
    const candidate = model("qwen3:1.7b", "unknown", "ollama")
    let finishVerification!: (result: Awaited<ReturnType<typeof api.verifyProviderModel>>) => void
    vi.spyOn(api, "createProvider").mockResolvedValue(saved)
    vi.spyOn(api, "testProvider").mockResolvedValue(connected)
    vi.mocked(api.discoverModelCatalog).mockResolvedValue(discovery(connected, [candidate]))
    vi.mocked(api.verifyProviderModel).mockImplementation(() => new Promise((resolve) => { finishVerification = resolve }))

    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Add Provider" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Local Ollama" } })
    fireEvent.change(within(dialog).getByLabelText("Provider type"), { target: { value: "ollama" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add provider" }))

    expect(await screen.findByText("Verifying qwen3:1.7b (1/1)…")).toBeInTheDocument()
    expect(screen.queryByText("qwen3:1.7b", { exact: true })).not.toBeInTheDocument()
    expect(within(row("ollama")).getByText("Verifying qwen3:1.7b (1/1)…")).toBeInTheDocument()
    finishVerification({
      provider: { ...connected, models_count: 1 },
      model: { ...candidate, qualification_status: "qualified", qualification_message: "Ready to use" },
    })
    expect(await within(row("ollama")).findByText("1 ready")).toBeInTheDocument()
    expect(within(document.getElementById("models-ollama")!).getByText("Ready")).toBeInTheDocument()
  })

  it("does not discover or verify models when automatic connection testing fails", async () => {
    const saved = { ...provider("ollama", "Local Ollama", "ollama"), status: "not_configured" as const }
    const failed = { ...saved, status: "error" as const, last_error: "Ollama connection test failed (could not connect to server)" }
    vi.spyOn(api, "createProvider").mockResolvedValue(saved)
    vi.spyOn(api, "testProvider").mockRejectedValue(new Error(failed.last_error!))
    vi.mocked(api.listProviders).mockResolvedValue([failed])

    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Add Provider" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Local Ollama" } })
    fireEvent.change(within(dialog).getByLabelText("Provider type"), { target: { value: "ollama" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add provider" }))

    expect(await screen.findByText(/Connection failed — Ollama connection test failed/)).toBeInTheDocument()
    expect(within(row("ollama")).getByText("Error")).toBeInTheDocument()
    expect(within(row("ollama")).getByRole("button", { name: "Test Connection" })).toBeEnabled()
    expect(api.discoverModelCatalog).not.toHaveBeenCalled()
    expect(api.verifyProviderModel).not.toHaveBeenCalled()
  })

  it("keeps connectivity healthy when model discovery fails and allows manual retry", async () => {
    const ollama = { ...provider("ollama", "Local Ollama", "ollama"), base_url: "http://host.docker.internal:11434" }
    vi.mocked(api.listProviders).mockResolvedValue([ollama])
    vi.spyOn(api, "testProvider").mockResolvedValue(ollama)
    vi.mocked(api.discoverModelCatalog).mockRejectedValueOnce(new Error("Ollama model discovery failed (server returned HTTP 503)"))

    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Local Ollama")
    fireEvent.click(within(row("ollama")).getByRole("button", { name: "Discover & Verify Models" }))
    expect(await screen.findByText(/Model discovery failed — Ollama model discovery failed/)).toBeInTheDocument()
    expect(within(row("ollama")).getByText("Connected")).toBeInTheDocument()
    expect(api.verifyProviderModel).not.toHaveBeenCalled()

    fireEvent.click(within(row("ollama")).getByRole("button", { name: "Test Connection" }))
    expect(await within(row("ollama")).findByText("Connected")).toBeInTheDocument()
    expect(api.testProvider).toHaveBeenCalledWith("ollama")
  })

  it("does not reverify when editing only the provider display name", async () => {
    const ollama = { ...provider("ollama", "Ollama Main", "ollama"), base_url: "http://localhost:11434" }
    vi.mocked(api.listProviders).mockResolvedValue([ollama])
    vi.spyOn(api, "updateProvider").mockResolvedValue({ ...ollama, name: "Ollama Renamed" })
    vi.spyOn(api, "testProvider").mockResolvedValue(ollama)
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Ollama Main")
    fireEvent.click(within(row("ollama")).getByRole("button", { name: "Edit" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Ollama Renamed" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }))
    expect(await screen.findByText("Provider updated.")).toBeInTheDocument()
    expect(api.updateProvider).toHaveBeenCalledWith("ollama", expect.objectContaining({ name: "Ollama Renamed" }))
    expect(api.testProvider).not.toHaveBeenCalled()
    expect(api.discoverModelCatalog).not.toHaveBeenCalled()
  })

  it("revalidates after changing the provider Base URL", async () => {
    const ollama = { ...provider("ollama", "Ollama Main", "ollama"), base_url: "http://localhost:11434" }
    const updated = { ...ollama, base_url: "http://host.docker.internal:11434", status: "not_configured" as const }
    vi.mocked(api.listProviders).mockResolvedValue([ollama])
    vi.spyOn(api, "updateProvider").mockResolvedValue(updated)
    vi.spyOn(api, "testProvider").mockResolvedValue({ ...updated, status: "connected" })
    const models = [model("qwen3:1.7b", "unknown", "ollama")]
    vi.mocked(api.discoverModelCatalog).mockResolvedValue(discovery({ ...updated, status: "connected" }, models))
    vi.mocked(api.verifyProviderModel).mockResolvedValue({
      provider: { ...updated, status: "connected", models_count: 1 },
      model: { ...models[0], qualification_status: "qualified", qualification_message: "Ready to use" },
    })

    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Ollama Main")
    fireEvent.click(within(row("ollama")).getByRole("button", { name: "Edit" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Base URL"), { target: { value: updated.base_url } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(within(row("ollama")).getByText("Connected")).toBeInTheDocument())
    expect(api.updateProvider).toHaveBeenCalledWith("ollama", expect.objectContaining({ base_url: updated.base_url }))
    expect(api.testProvider).toHaveBeenCalledWith("ollama")
    expect(api.discoverModelCatalog).toHaveBeenCalledWith("ollama")
    expect(api.verifyProviderModel).toHaveBeenCalledWith("ollama", "qwen3:1.7b")
  })

  it("ignores duplicate manual discovery clicks while a catalog request is running", async () => {
    let finishDiscovery!: (result: ReturnType<typeof discovery>) => void
    vi.mocked(api.discoverModelCatalog).mockImplementationOnce(() => new Promise((resolve) => { finishDiscovery = resolve }))
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    const button = within(row("gemini")).getByRole("button", { name: "Discover & Verify Models" })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(api.discoverModelCatalog).toHaveBeenCalledTimes(1))
    finishDiscovery(discovery(providers[0], []))
    expect(await within(row("gemini")).findByText("Ready")).toBeInTheDocument()
    expect(api.discoverModelCatalog).toHaveBeenCalledTimes(1)
  })

  it("excludes non-generation and missing catalog entries even if previously qualified", async () => {
    vi.mocked(api.listModels).mockResolvedValue([
      ...allModels,
      { ...model("Embedding", "qualified"), generation_candidate: false },
      { ...model("Removed model", "qualified"), is_available: false },
    ])
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "View Models" }))
    await screen.findByText("Usable models (1)")
    expect(screen.queryByText("Embedding")).not.toBeInTheDocument()
    expect(screen.queryByText("Removed model")).not.toBeInTheDocument()
  })

  it("pauses on a provider rate limit without probing more models", async () => {
    const candidates = [model("First", "unknown"), model("Second", "unknown")]
    vi.mocked(api.discoverModelCatalog).mockResolvedValue(discovery(providers[0], candidates))
    vi.mocked(api.verifyProviderModel).mockResolvedValue({ provider: providers[0], model: {
      ...candidates[0], qualification_status: "transient_error", qualification_error_code: "provider_rate_limited",
    } })
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Discover & Verify Models" }))
    await screen.findByText("Verification paused")
    expect(api.verifyProviderModel).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("First", { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText("Second", { exact: true })).not.toBeInTheDocument()
  })

  it("does not misclassify a verification transport error as permanent incompatibility", async () => {
    vi.mocked(api.verifyProviderModel).mockRejectedValue(new Error("Connection interrupted"))
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "Discover & Verify Models" }))
    await screen.findByText("Verification paused")
    expect(api.verifyProviderModel).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
  })

  it("uses Thai labels for both toggle states", async () => {
    await i18n.changeLanguage("th")
    render(<MemoryRouter><ProvidersPage /></MemoryRouter>)
    await screen.findByText("Gemini Main")
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "ดู Model" }))
    expect(await screen.findByText("Models ที่พร้อมใช้งาน (1)")).toBeInTheDocument()
    expect(within(row("gemini")).getByRole("button", { name: "ซ่อน Model" })).toBeInTheDocument()
    fireEvent.click(within(row("gemini")).getByRole("button", { name: "ซ่อน Model" }))
    expect(screen.queryByText("Ready Alpha")).not.toBeInTheDocument()
  })
})
