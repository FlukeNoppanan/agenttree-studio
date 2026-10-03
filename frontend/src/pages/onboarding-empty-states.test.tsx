import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { ProvidersPage } from "@/pages/providers"
import { TreeListPage } from "@/pages/trees/tree-list"
import { ToolsPage } from "@/pages/tools"
import { RunListPage } from "@/pages/runs/run-list"
import i18n from "@/i18n"
vi.mock("@/auth", () => ({ useAuth: () => ({ can: () => true }) }))
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
function mount(page: React.ReactNode) { render(<MemoryRouter>{page}<Location /></MemoryRouter>) }
beforeEach(async () => {
 vi.restoreAllMocks(); await i18n.changeLanguage("en")
 vi.spyOn(api, "listProviders").mockResolvedValue([]); vi.spyOn(api, "listSecrets").mockResolvedValue([])
 vi.spyOn(api, "listTrees").mockResolvedValue([]); vi.spyOn(api, "listTools").mockResolvedValue([])
 vi.spyOn(api, "listToolCatalog").mockResolvedValue([]); vi.spyOn(api, "listRuns").mockResolvedValue([])
})
it("explains Providers and opens the existing connection dialog", async () => {
 mount(<ProvidersPage />); await screen.findByText("No AI Providers connected yet")
 fireEvent.click(screen.getByRole("button", { name: "Connect Provider" }))
 expect(screen.getByRole("dialog")).toBeInTheDocument()
 expect(screen.getByRole("link", { name: "Save Provider credentials in Secrets" })).toHaveAttribute("href", "/secrets")
})
it("recommends Templates while preserving the Blank Tree action", async () => {
 mount(<TreeListPage />); await screen.findByText("You don’t have any Trees yet")
 expect(screen.getByRole("button", { name: "Create Blank Tree" })).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: "Create from Template" }))
 expect(screen.getByTestId("location")).toHaveTextContent("/templates")
})
it("explains optional Tools and returns to the existing Catalog", async () => {
 mount(<ToolsPage />); await screen.findByText(/Tools are optional for a basic Tree/)
 fireEvent.click(screen.getByRole("button", { name: /My Tools/ }))
 expect(await screen.findByText("No Tools configured")).toBeInTheDocument()
 expect(screen.getByText(/You do not need a Tool for your first basic Tree/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: "Explore Tool Catalog" }))
 expect(screen.getByRole("button", { name: "Catalog" })).toHaveAttribute("aria-pressed", "true")
})
it("explains Runs and links to existing Trees", async () => {
 mount(<RunListPage />); await screen.findByText("No Runs yet")
 fireEvent.click(screen.getByRole("button", { name: "View Trees" }))
 expect(screen.getByTestId("location")).toHaveTextContent("/trees")
})
