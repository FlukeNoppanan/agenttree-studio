import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"
import { AppTopbar } from "@/components/app-topbar"
import { Sidebar } from "@/components/sidebar"
import i18n from "@/i18n"

const auth = vi.hoisted(() => ({ user: { username: "reader", is_admin: false, is_primary_admin: false, permissions: ["use_trees"] }, setUser: vi.fn(), can: (_permission: string): boolean => false }))
vi.mock("@/auth", () => ({ useAuth: () => auth }))
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
function mount() { return render(<MemoryRouter initialEntries={["/trees"]}><Sidebar /><AppTopbar /><Location /></MemoryRouter>) }
beforeEach(async () => { auth.user.is_admin = false; auth.can = () => false; await i18n.changeLanguage("en") })

it("keeps one global utility set and moves Getting Started out of operational navigation", () => {
  mount()
  expect(screen.getAllByRole("button", { name: "Account menu" })).toHaveLength(1)
  expect(screen.getAllByRole("combobox", { name: "Language" })).toHaveLength(1)
  for (const nav of screen.getAllByRole("navigation")) expect(within(nav).queryByRole("link", { name: "Getting Started" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("link", { name: "Getting Started" }))
  expect(screen.getByTestId("location")).toHaveTextContent("/getting-started")
})
it("keeps restricted resource/admin routes hidden while preserving account API Keys", () => {
  mount()
  expect(screen.queryByRole("link", { name: "Providers" })).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }))
  expect(screen.queryByRole("menuitem", { name: "API Keys" })).not.toBeInTheDocument()
  expect(screen.getByRole("link", { name: "API Keys" })).toHaveAttribute("href", "/account?section=api-keys")
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Account menu" })).toHaveFocus()
})
it("uses a downward popup and keyboard menu navigation", () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Account menu" }))
  expect(screen.getByRole("menu")).toHaveClass("top-full", "right-0")
  expect(screen.getByRole("menuitem", { name: "My Account" })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" })
  expect(screen.getByRole("menuitem", { name: "Change Password" })).toHaveFocus()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
})
it("localizes navigation groups without translating technical route names", async () => {
  auth.user.is_admin = true; auth.can = () => true; mount()
  await i18n.changeLanguage("th")
  for (const label of ["พื้นที่ทำงาน", "ทรัพยากร", "ความสามารถอัจฉริยะ", "การติดตาม"]) expect(screen.getByText(label)).toBeInTheDocument()
  for (const label of ["Settings", "Users", "Learning", "Trees", "Security Events"]) expect(screen.getAllByRole("link", { name: new RegExp(`^${label}`) }).length).toBeGreaterThan(0)
  expect(screen.getByRole("link", { name: "Getting Started" })).toBeInTheDocument()
})

it("places Runs and the existing Execution Trace route in their operational groups", () => {
 auth.user.is_admin = true; auth.can = () => true; mount()
 for (const nav of screen.getAllByRole("navigation")) {
  expect(within(nav).getByRole("link", {name:"Runs"})).toHaveAttribute("href", "/executions")
  expect(within(nav).getByRole("link", {name:"Execution Trace"})).toHaveAttribute("href", "/execution-trace")
 }
 expect(screen.getAllByRole("link", {name:"API Keys"})).toHaveLength(1)
})
