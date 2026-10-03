import { describe, expect, it } from "vitest"
import { traceActivities } from "@/lib/trace-activity"
import { apiExamples, apiResponseExamples } from "@/components/tree/api-examples"
import type { TraceEvent, TreeDetail } from "@/lib/api"
const event = (type:string, sequence=1, metadata={}) => ({id:String(sequence),run_id:"run",sequence,event_type:type,agent_id:"manager-a",agent_name:"Observed Manager",payload:{metadata},created_at:"2026-10-04T00:00:00Z"}) as TraceEvent
const tree = { version:{agents:[{id:"manager-a",name:"Duplicate",agent_type:"manager"},{id:"manager-b",name:"Duplicate",agent_type:"manager"}]}} as TreeDetail

describe("Human activity preserves factual reviews and technical events", () => {
 it("distinguishes Manager review, Root final review and synthesis", () => {
  const items=traceActivities([event("orchestration.manager_review_started"),event("orchestration.final_review_started",2),event("orchestration.final_result_created",3),event("root.synthesis.completed",4)])
  expect(items.map(item=>item.key)).toEqual(["managerReview","rootReview","finalized","synthesized"])
  expect(items[2].stage).toBe("rootReview")
 })
 it("presents one lifecycle transition without deleting any technical records", () => {
  const source=[event("execution.started"),{...event("execution.started",2),agent_id:null}]
  expect(traceActivities(source)).toHaveLength(1);expect(source).toHaveLength(2)
 })
 it("maps real IDs and feedback, without inventing a Specialist rerun", () => {
  const items=traceActivities([event("orchestration.final_review_revision_requested",1,{feedback:"Address missing coverage",requested_revision_number:1})],tree)
  expect(items).toHaveLength(1);expect(items[0].key).toBe("rootRevise")
  expect(items[0].actor).toBe("Observed Manager");expect(items[0].context).toContainEqual(["feedback","Address missing coverage"])
 })
 it("folds known infrastructure only and retains unknown future events", () => {
  const source=[event("operation.prepared"),event("future.custom",2),event("operation.future",3)]
  expect(traceActivities(source).map(item=>item.event.event_type)).toEqual(["future.custom","operation.future"])
  expect(source).toHaveLength(3)
 })
 it("preserves repeated revisions at different timestamps, deduplicating only identical human entries", () => {
  const first=event("orchestration.revision_started")
  const second={...first,id:"two",sequence:2,created_at:"2026-10-04T00:00:01Z"}
  expect(traceActivities([first,{...first,id:"copy",sequence:3},second])).toHaveLength(2)
 })
 it("surfaces limits and failures as observed outcomes", () => {
  expect(traceActivities([event("orchestration.final_revision_limit_reached")])[0].outcome).toBe("warning")
  expect(traceActivities([event("orchestration.specialist_execution_failed")])[0].outcome).toBe("error")
 })
})
describe("Complete public clients",()=>{
 for(const asyncApi of [true,false]) it(`generates credential-free complete ${asyncApi?'V2':'V1'} clients`,()=>{
  const {examples}=apiExamples("http://localhost:5173","tree-123",asyncApi)
  for(const code of Object.values(examples)){expect(code).toContain("AGENTTREE_API_KEY");expect(code).not.toContain("ats_")}
  expect(examples.Python).toContain("raise_for_status")
  expect(examples.JavaScript).toContain("response.ok")
  expect(examples.cURL).toContain("set -eu")
  if(asyncApi)for(const code of Object.values(examples)) {expect(code).toContain("/result");expect(code).toContain("cancelled")}
  else expect(examples.Python).toContain("/api/v1/trees/tree-123/invoke")
 })
 it("documents current response field names without mixing V1 and V2",()=>{
  expect(apiResponseExamples(true)[0].value).toHaveProperty("tree_version_id")
  expect(apiResponseExamples(true)[1].value).toHaveProperty("final_output")
  expect(apiResponseExamples(false)[0].value).toHaveProperty("output.content")
 })
})
