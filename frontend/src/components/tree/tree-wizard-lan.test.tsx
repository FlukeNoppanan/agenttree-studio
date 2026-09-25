import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TreeWizard } from "@/components/tree/tree-wizard"
import { emptyAgent, emptyWizard, wizardPayload } from "@/components/tree/types"
import { generateClientId } from "@/lib/client-id"
import { api } from "@/lib/api"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("Tree draft IDs on secure and LAN HTTP contexts", () => {
  beforeEach(() => {
    vi.spyOn(api, "listProviders").mockResolvedValue([])
    vi.spyOn(api, "listTools").mockResolvedValue([])
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("keeps browser UUID behavior when randomUUID is available", () => {
    const randomUUID = vi.fn().mockReturnValue("11111111-1111-4111-8111-111111111111")
    vi.stubGlobal("crypto", { randomUUID })
    expect(generateClientId()).toBe("11111111-1111-4111-8111-111111111111")
    expect(emptyWizard().root.id).toBe("11111111-1111-4111-8111-111111111111")
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })

  it("renders the Wizard and creates distinct Root, Manager, and Specialist IDs without randomUUID", async () => {
    const browserCrypto = globalThis.crypto
    vi.stubGlobal("crypto", { getRandomValues: browserCrypto.getRandomValues.bind(browserCrypto) })
    const drafts = Array.from({ length: 100 }, () => generateClientId())
    expect(new Set(drafts).size).toBe(100)
    expect(drafts.every(id => uuidPattern.test(id))).toBe(true)
    const root = emptyWizard()
    const manager = emptyAgent("Manager")
    const specialist = emptyAgent("Specialist")
    expect(new Set([root.root.id, manager.id, specialist.id]).size).toBe(3)
    root.managers.push({ agent: manager, specialists: [specialist] })
    expect(wizardPayload(root).agents.map(agent => agent.id)).toEqual([root.root.id, manager.id, specialist.id])

    render(<MemoryRouter><TreeWizard /></MemoryRouter>)
    expect(await screen.findByText("Create Tree")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Managers/i }))
    fireEvent.click(screen.getByRole("button", { name: /Add Manager/i }))
    fireEvent.click(screen.getByRole("button", { name: "Save Agent" }))
    await waitFor(() => expect(screen.getAllByText("New Manager").length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole("button", { name: /Specialists/i }))
    fireEvent.click(screen.getByRole("button", { name: /Add Specialist/i }))
    fireEvent.click(screen.getByRole("button", { name: "Save Agent" }))
    await waitFor(() => expect(screen.getAllByText("New Specialist").length).toBeGreaterThan(0))
  })

  it("uses a non-counter draft fallback if Web Crypto is entirely absent", () => {
    vi.stubGlobal("crypto", undefined)
    const ids = Array.from({ length: 100 }, () => generateClientId())
    expect(new Set(ids).size).toBe(100)
    expect(ids.every(id => uuidPattern.test(id))).toBe(true)
  })
})
