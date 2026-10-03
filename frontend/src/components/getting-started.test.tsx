import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"
import { GettingStarted } from "@/components/getting-started"
import { ConceptHelp } from "@/components/concept-help"
import { api, type GettingStartedState, type MyDashboard, type Permission } from "@/lib/api"
import { acknowledgeConnect, onboardingPreferences } from "@/lib/onboarding"
import i18n from "@/i18n"
let permissions: Permission[] = []
vi.mock("@/auth", () => ({ useAuth: () => ({ user: { id: "new-user" }, can: (p: Permission) => permissions.includes(p) }) }))
const fresh: GettingStartedState = { provider_ready: false, trees: [], runnable_tree_id: null, successful_run_id: null, has_successful_run: false }
const ready = { id: "tree-first", name: "First Tree", template: "builtin-analysis", ready: true }
const second = { ...ready, id: "tree-second", name: "Second Tree" }
function response(onboarding = fresh, granted = onboarding.trees.filter(tree => tree.ready).map(tree => tree.id)) { return { onboarding, available_trees: granted.map(id => ({ id, name: id, status: "ready" })) } as MyDashboard }
function state(onboarding = fresh, granted?: string[]) { vi.spyOn(api, "myDashboard").mockResolvedValue(response(onboarding, granted)) }
function mount(expanded = true) { return render(<MemoryRouter><GettingStarted expanded={expanded} /></MemoryRouter>) }
function step(name: string) { return within(document.querySelector(`[aria-label="${name}"]`)! as HTMLElement) }
beforeEach(async () => { vi.restoreAllMocks(); localStorage.clear(); permissions = ["manage_trees_agents", "manage_providers_models", "view_executions", "use_trees"]; await i18n.changeLanguage("en") })
it("teaches the hierarchy before Provider and Template setup", async () => {
 state(); mount(); await screen.findByRole("link", { name: "Connect Provider" })
 expect(screen.getByText("Understand AgentTree")).toBeInTheDocument()
 expect(screen.getByRole("link", { name: "Connect Provider" })).toHaveAttribute("href", "/providers")
 expect(screen.getByRole("link", { name: "Create from Template" })).toHaveAttribute("href", "/templates")
 expect(screen.queryByRole("link", { name: "Run Tree" })).not.toBeInTheDocument()
})
it.each([
 [{ ...fresh, provider_ready: true }, 1],
 [{ ...fresh, provider_ready: true, trees: [{ ...ready, ready: false }] }, 2],
 [{ ...fresh, provider_ready: true, trees: [ready], runnable_tree_id: ready.id }, 3],
 [{ ...fresh, provider_ready: true, trees: [ready], runnable_tree_id: ready.id, has_successful_run: true, successful_run_id: "run-first" }, 4],
])("preserves real-state progress %#", async (facts, count) => {
 state(facts); mount(); await screen.findByRole("progressbar")
 expect(screen.getAllByText("Complete")).toHaveLength(count)
 expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(count))
})
it("names the single Tree before offering direct continuation", async () => {
 state({ ...fresh, provider_ready: true, trees: [ready], runnable_tree_id: ready.id }); mount()
 await screen.findByRole("link", { name: "Run Tree" })
 expect(step("Configure your Agents").getByText("First Tree")).toBeInTheDocument()
 expect(screen.getByRole("link", { name: "Configure Tree" })).toHaveAttribute("href", `/trees/${ready.id}/setup`)
 expect(screen.getByRole("link", { name: "Run Tree" })).toHaveAttribute("href", `/trees/${ready.id}/playground`)
 expect(screen.getByRole("link", { name: "Open Connect" })).toHaveAttribute("href", `/trees/${ready.id}?tab=connect`)
})
it.each([['Configure your Agents','Choose Tree','setup'],['Run your Tree','Choose Ready Tree','playground'],['Connect your Tree to an application','Choose Ready Tree','?tab=connect']])("requires explicit multiple-Tree selection for %s", async (title, label, destination) => {
 state({ ...fresh, trees: [ready, second], runnable_tree_id: ready.id }); mount()
 await screen.findByRole("progressbar"); fireEvent.click(step(title).getByRole("button", { name: label }))
 const dialog = screen.getByRole("dialog")
 expect(within(dialog).getByText("First Tree")).toBeInTheDocument();expect(within(dialog).getByText("Second Tree")).toBeInTheDocument()
 expect(within(dialog).getByRole("link", { name: "Select Second Tree" })).toHaveAttribute("href", destination.startsWith('?') ? `/trees/${second.id}${destination}` : `/trees/${second.id}/${destination}`)
 expect(screen.queryByRole("link", { name: "Run Tree" })).not.toBeInTheDocument()
})
it("excludes inaccessible Ready Trees from execution and Connect selection", async () => {
 state({ ...fresh, trees: [ready, second] }, [second.id]); mount(); await screen.findByRole("link", { name: "Run Tree" })
 expect(step("Run your Tree").queryByText("First Tree")).not.toBeInTheDocument()
 expect(screen.getByRole("link", { name: "Run Tree" })).toHaveAttribute("href", `/trees/${second.id}/playground`)
})
it("explains zero Ready Trees instead of guessing a draft", async () => {
 state({ ...fresh, trees: [{ ...ready, ready: false }] }); mount(); await screen.findByRole("progressbar")
 expect(step("Run your Tree").getByText(/Finish configuring/)).toBeInTheDocument()
 expect(screen.queryByRole("link", { name: "Run Tree" })).not.toBeInTheDocument()
})
it("keeps every Dashboard guide compact and links to the full tutorial", async () => {
 state();mount(false);await screen.findByRole("progressbar")
 expect(screen.queryByText("Connect an AI Provider")).not.toBeInTheDocument()
 expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/getting-started")
})
it("reflects established resources in compact progress without resetting them", async () => {
 state({ ...fresh, provider_ready: true, trees: [ready], has_successful_run: true });mount(false)
 expect(await screen.findByText("4 of 6 steps completed")).toBeInTheDocument()
})
it("persists only the new mental-model acknowledgement", async () => {
 state();mount();fireEvent.click(await screen.findByRole("button", { name: "I understand the basics" }))
 expect(onboardingPreferences("new-user").understood).toBe(true)
 expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
})
it("preserves account-specific Connect acknowledgement without an API key", async () => {
 acknowledgeConnect("another-account", ready.id);expect(onboardingPreferences("new-user").connectedTreeIds).toEqual([])
 acknowledgeConnect("new-user", ready.id);state({ ...fresh, provider_ready: true, trees: [ready] });mount()
 expect(await screen.findByText("4 of 6 steps completed")).toBeInTheDocument()
})
it("handles corrupt and blocked browser storage safely", () => {
 localStorage.setItem("agenttree-studio:onboarding:v1:new-user", "{")
 expect(onboardingPreferences("new-user")).toEqual({ collapsed: false, understood: false, connectedTreeIds: [] })
 vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("blocked") })
 expect(() => acknowledgeConnect("new-user", ready.id)).not.toThrow()
})
it("adapts actions to restricted Tree operators", async () => {
 permissions = ["use_trees"];state({ ...fresh, provider_ready: null, trees: [ready], has_successful_run: null });mount()
 await screen.findByRole("progressbar")
 for (const name of ['Connect Provider','Configure Tree','Open Connect','Run Tree']) expect(screen.queryByRole("link", { name })).not.toBeInTheDocument()
 expect(screen.getByRole("link", { name: "Tree Access" })).toHaveAttribute("href", "/account?section=tree-access")
})
it("provides retry after request failure", async () => {
 vi.spyOn(api, "myDashboard").mockRejectedValueOnce(Error("failure")).mockResolvedValueOnce(response());mount()
 fireEvent.click(await screen.findByRole("button", { name: "Retry" }));expect(await screen.findByRole("progressbar")).toBeInTheDocument()
})
it.each(['en','th'])("uses localized contextual help in %s", async language => {
 await i18n.changeLanguage(language);render(<ConceptHelp concept="capability" />);fireEvent.click(screen.getByRole("button"))
 expect(within(screen.getByRole("dialog")).getByText(i18n.t('onboarding.terms.capability.description'))).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: i18n.t('toolUx.close') }));expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
it("refreshes derived state after setup changes", async () => {
 vi.spyOn(api, "myDashboard").mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ ...fresh, provider_ready: true, trees: [ready] }));mount()
 await screen.findByRole("progressbar");fireEvent.click(screen.getByRole("button", { name: "Refresh setup progress" }))
 await screen.findByRole("link", { name: "Run Tree" });expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3")
})
it("uses existing setup workspace for a Blank Tree with management permission only", async () => {
 permissions = ['manage_trees_agents'];state({ ...fresh, trees: [{ ...ready, template:'blank', ready:false }] });mount()
 expect(await screen.findByRole("link", { name:'Configure Tree' })).toHaveAttribute('href', `/trees/${ready.id}/setup`)
})
it("switches tutorial and picker language without reload", async () => {
 state({ ...fresh, trees:[ready,second] });mount();await screen.findByRole('progressbar')
 fireEvent.click(step('Configure your Agents').getByRole('button',{name:'Choose Tree'}))
 await i18n.changeLanguage('th');expect(await screen.findByRole('heading',{name:'เลือก Tree ที่ต้องการ'})).toBeInTheDocument()
 expect(screen.getByText('ทำความรู้จัก AgentTree')).toBeInTheDocument()
 await i18n.changeLanguage('en');expect(await screen.findByRole('heading',{name:'Select a Tree'})).toBeInTheDocument()
})
