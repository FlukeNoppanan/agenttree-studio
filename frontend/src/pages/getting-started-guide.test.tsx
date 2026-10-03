import {render,screen,fireEvent} from "@testing-library/react"
import {MemoryRouter} from "react-router-dom"
import {beforeEach,expect,it,vi} from "vitest"
import i18n from "@/i18n"
import {GettingStartedPage} from "@/pages/getting-started"
import {api} from "@/lib/api"
const access=vi.hoisted(()=>({permissions:new Set<string>()}))
vi.mock("@/auth",()=>({useAuth:()=>({user:null,can:(permission:string)=>access.permissions.has(permission)})}))
beforeEach(()=>{vi.restoreAllMocks();access.permissions.clear();vi.spyOn(api,"integrationConfig").mockResolvedValue({public_origin:"https://studio.example"})})
for(const language of ["en","th"])it(`documents all product stages naturally in ${language}, preserving technical nouns`,async()=>{
 await i18n.changeLanguage(language)
 render(<MemoryRouter><GettingStartedPage/></MemoryRouter>)
 expect(await screen.findByText(i18n.t("revision.integration.asyncTitle"))).toBeInTheDocument()
 for(const section of ["credentials","build","review","outputs","api","versions","integrations"]){expect(screen.getByRole("heading",{name:i18n.t("productGuide.sections."+section+".title")})).toBeInTheDocument()}
 expect(screen.getByText(i18n.t("productGuide.providerDirection"))).toBeInTheDocument()
 expect(screen.getByText(i18n.t("productGuide.appDirection"))).toBeInTheDocument()
 expect(screen.queryByRole("link",{name:"Secrets"})).not.toBeInTheDocument()
 for(const noun of ["Root","Manager","Specialist","Provider","Model","API Key","Webhook","MCP"]){expect(document.body.textContent).toContain(noun)}
 if(language==="th") expect(document.body.textContent).not.toMatch(/ผู้ให้บริการ|เอเจนต์|พรอไวเดอร์|แม่แบบ|เทมเพลต/)
 fireEvent.click(screen.getAllByText(i18n.t("baseline.apiWorkbench.responses"))[0]);expect(screen.getByText(/tree_version_id/)).toBeInTheDocument()
})
it("keeps testing guidance within the current route permissions",async()=>{
 await i18n.changeLanguage("en")
 access.permissions=new Set(["use_trees","view_executions"])
 render(<MemoryRouter><GettingStartedPage/></MemoryRouter>)
 expect(await screen.findByText(i18n.t("revision.integration.asyncTitle"))).toBeInTheDocument()
 expect(screen.queryByRole("link",{name:"Trees → Playground"})).not.toBeInTheDocument()
 expect(screen.getByRole("link",{name:"Executions"})).toBeInTheDocument()
 expect(screen.getByRole("link",{name:"Account → API Keys"})).toBeInTheDocument()
})
