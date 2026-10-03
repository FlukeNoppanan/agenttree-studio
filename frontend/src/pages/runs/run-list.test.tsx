import { fireEvent,render,screen,waitFor } from "@testing-library/react"
import { MemoryRouter,useLocation } from "react-router-dom"
import { beforeEach,expect,it,vi } from "vitest"
import { RunListPage, localFilterToIso } from "@/pages/runs/run-list"
import {api} from "@/lib/api"
import i18n from "@/i18n"
const permissions=vi.hoisted(()=>({manage:true}))
vi.mock("@/auth",()=>({useAuth:()=>({can:(value:string)=>value!=="manage_trees_agents"||permissions.manage})}))
function Location(){const value=useLocation();return <output data-testid="url">{value.search}</output>}
beforeEach(async()=>{vi.restoreAllMocks();permissions.manage=true;await i18n.changeLanguage("en");vi.spyOn(api,"listTrees").mockResolvedValue([]);vi.spyOn(api,"listRunPage").mockResolvedValue({items:[],total:0,page:1,page_size:25})})
it("restores combined URL filters and sends them to server before pagination",async()=>{
 render(<MemoryRouter initialEntries={["/executions?search=research&status=completed&tree_id=allowed&page=2&from=2026-10-01T09%3A00"]}><RunListPage/><Location/></MemoryRouter>)
 await waitFor(()=>expect(api.listRunPage).toHaveBeenCalled())
 const query=vi.mocked(api.listRunPage).mock.calls[0][0]
 expect(query.get("search")).toBe("research");expect(query.get("status")).toBe("completed");expect(query.get("page")).toBe("2");expect(query.get("tree_id")).toBe("allowed");expect(query.get("after")).toBe(localFilterToIso("2026-10-01T09:00"))
 expect(await screen.findByText("No matching Executions")).toBeInTheDocument()
 fireEvent.click(screen.getAllByRole("button",{name:"Clear filters"})[0]);await waitFor(()=>expect(screen.getByTestId("url")).toHaveTextContent(""))
})
it("resets the page on filter changes and preserves URL state",async()=>{
 render(<MemoryRouter initialEntries={["/executions?page=3"]}><RunListPage/><Location/></MemoryRouter>)
 fireEvent.change(screen.getByRole("searchbox"),{target:{value:"target"}})
 await waitFor(()=>expect(api.listRunPage).toHaveBeenCalled())
 expect(screen.getByTestId("url")).toHaveTextContent("?search=target")
 expect(vi.mocked(api.listRunPage).mock.lastCall?.[0].get("page")).toBe("1")
})
it("rejects invalid date range without sending a misleading request",async()=>{
 render(<MemoryRouter initialEntries={["/executions?from=2026-10-04T09%3A00&to=2026-10-01T09%3A00"]}><RunListPage/></MemoryRouter>)
 expect(await screen.findByRole("alert")).toBeInTheDocument();expect(api.listRunPage).not.toHaveBeenCalled()
})

it("combines rapid changes without dropping earlier filters",async()=>{
 render(<MemoryRouter><RunListPage/><Location/></MemoryRouter>)
 fireEvent.change(screen.getByRole("searchbox"),{target:{value:"review"}})
 fireEvent.change(screen.getByRole("combobox",{name:"Status"}),{target:{value:"completed"}})
 fireEvent.change(screen.getByLabelText("From (local time)"),{target:{value:"2026-10-01T09:00"}})
 await waitFor(()=>expect(api.listRunPage).toHaveBeenCalled())
 const query=vi.mocked(api.listRunPage).mock.lastCall![0]
 expect(query.get("search")).toBe("review");expect(query.get("status")).toBe("completed");expect(query.get("after")).toBeTruthy()
})

it("loads granted Tree names without requesting forbidden management resources",async()=>{
 permissions.manage=false
 vi.spyOn(api,"myDashboard").mockResolvedValue({available_trees:[{id:"allowed",name:"Granted Tree",status:"ready"}]} as never)
 render(<MemoryRouter><RunListPage/></MemoryRouter>)
 expect(await screen.findByRole("option",{name:"Granted Tree"})).toBeInTheDocument()
 expect(api.listTrees).not.toHaveBeenCalled()
})
