import { fireEvent, render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import i18n from "@/i18n"
import { ModelCatalog } from "./model-compatibility"
import { ProviderModelSelector } from "./tree/provider-model-selector"
import { HumanExecutionTrace } from "./human-execution-trace"
import { ExecutionInspector } from "./execution-inspector"
import { RunRecoveryNotice } from "./run-status-badge"
import { recoveredAttempts } from "@/lib/run-presentation"
import type { ProviderModel, TraceEvent } from "@/lib/api"

const model: ProviderModel = {id:"local",provider_connection_id:"provider",model_id:"native-local",display_name:null,is_available:true,generation_candidate:true,qualification_status:"limited",qualification_checked_at:"2026-10-04T10:00:00Z",qualification_error_code:"structured_decision_not_qualified",qualification_message:null,discovered_at:"2026-10-04T10:00:00Z",metadata:{agenttree_qualification:{version:1,generation:"passed",roles:{root:"passed",manager:"not_qualified",specialist:"passed"},tool_calling:"not_tested",checks:{decomposition:{status:"failed",reason_code:"routing_not_exercised"}}}}}
const connection = {id:"provider",name:"Local Ollama",status:"connected",provider_type:"ollama"} as never
const event = (sequence: number, type: string, decision: string, strategy: string): TraceEvent => ({id:String(sequence),run_id:"run",sequence,agent_id:"root",agent_name:"Root",event_type:type,payload:{metadata:{decision_id:decision,strategy,reason_code:"missing_required_field",field:"objective"}},created_at:"2026-10-04T10:00:00Z"})

describe("Model qualification and decision evidence", () => {
  beforeEach(async () => { await i18n.changeLanguage("en") })
  it.each(["en","th"])("shows Limited evidence and retry in %s without raw diagnostic text", async locale => {
    await i18n.changeLanguage(locale)
    const retry = vi.fn()
    render(<ModelCatalog models={[model]} onVerify={retry} />)
    expect(screen.getByText("Limited")).toBeInTheDocument()
    fireEvent.click(screen.getByText(i18n.t("compatibility.evidence")))
    expect(screen.getByText(i18n.t("compatibility.checks.decomposition"))).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button",{name:i18n.t("compatibility.verify")}))
    expect(retry).toHaveBeenCalledWith(model)
  })
  it("keeps unavailable diagnostics collapsed until requested", () => {
    render(<ModelCatalog models={[model,{...model,id:"missing",model_id:"missing",is_available:false,qualification_status:"unavailable"}]} onVerify={vi.fn()} />)
    expect(screen.queryByText("missing")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button",{name:/Other Models/}))
    expect(screen.getAllByText("missing")).toHaveLength(2)
  })
  it("handles incomplete stored evidence without claiming Ready or crashing", () => {
    render(<ModelCatalog models={[{...model,metadata:{agenttree_qualification:{version:1}}}]} onVerify={vi.fn()} />)
    expect(screen.getByText("Limited")).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("compatibility.evidence"))).not.toBeInTheDocument()
  })
  it.each(["root","manager","specialist"] as const)("preserves Limited selection and shows accurate %s guidance", async role => {
    const change=vi.fn()
    render(<ProviderModelSelector role={role} providers={[connection]} modelCatalogs={{provider:[model]}} providerId="provider" modelId="native-local" onProviderChange={vi.fn()} onModelChange={change} />)
    expect(await screen.findByRole("status")).toHaveTextContent(i18n.t(role==="root"?"compatibility.rolePassed":role==="specialist"?"compatibility.specialistWarning":"compatibility.orchestrationWarning",{role}))
    expect(screen.getByRole("combobox",{name:"Model"})).toHaveValue("native-local")
    expect(change).not.toHaveBeenCalled()
    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("compatibility.noFallback"))
  })
  it("separates decision A recovery from later decision B failure", () => {
    const events=[event(1,"structured_decision.validation_failed","a","triage"),event(2,"structured_decision.repair.succeeded","a","triage"),event(3,"structured_decision.validation_failed","b","final_review"),event(4,"structured_decision.repair.failed","b","final_review")]
    expect([...recoveredAttempts(events)]).toEqual([1])
    render(<><RunRecoveryNotice events={events}/><HumanExecutionTrace events={events}/></>)
    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("compatibility.partialRepairNotice"))
    expect(screen.getByText("This decision was repaired")).toBeInTheDocument()
    expect(screen.getByText("This decision could not be repaired")).toBeInTheDocument()
    expect(screen.getAllByText(/Root Final Review/).length).toBeGreaterThan(0)
  })
  it("shows pinned roles once, without repeated Specialist subtask rows or Secret values", () => {
    const agents=["root","manager","specialist"].map(role=>({id:role,name:`Bound ${role}`,agent_type:role,model_id:"native-local",provider_reference:{name:"Local Ollama",secret_value:"sentinel-credential"}}))
    const entry={specialist_id:"specialist",agent_result:{metadata:{provider:"Ollama actual",model:"native-local"}}}
    const run={id:"run",status:"failed",tree_version_id:"version",input:{input:"synthetic"},trace:[],state:{execution_result:{manager_executions:[{specialist_executions:[entry,entry]}]}},started_at:"2026-10-04T10:00:00Z"} as never
    render(<ExecutionInspector run={run} tree={{version:{id:"version",agents}} as never} showTrace={false} />)
    expect(screen.getByText("Bound root · Root Agent")).toBeInTheDocument()
    expect(screen.getByText("Bound manager · Manager")).toBeInTheDocument()
    expect(screen.getAllByText("Bound specialist · Specialist")).toHaveLength(2) // pinned + one observed
    expect(screen.getByText("Provider: Ollama actual")).toBeInTheDocument()
    expect(screen.queryByText("sentinel-credential")).not.toBeInTheDocument()
  })
})
