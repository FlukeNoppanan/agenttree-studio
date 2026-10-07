import { describe, it, expect } from 'vitest'
import { executionProjection, displayResult, inputText, reduceExecution, projectJournal, emptyExecutionJournal } from './playground-execution'
import { reduceLive, emptyLiveModel } from './run-live'
import type { AgentDraft, LiveEvent } from './api'
const agents = ['root', 'manager', 'spec', 'untouched'].map(id => ({ id, name: 'Duplicate name' })) as AgentDraft[]
let cursor = 0
const event = (id: string, type: string, key = id, sequence = ++cursor): LiveEvent => ({ sequence, type: `operation.${type}`, agent_id: id, agent_name: 'Duplicate name', payload: { metadata: { operation_key: key, operation_type: 'manager.review' } }, created_at: '' })
describe('real operation graph projection', () => {
  it('maps stable Agent IDs rather than duplicate names', () => { expect(executionProjection(agents, [event('manager', 'in_flight')]).states).toEqual({ manager: 'running' }) })
  it('unknown Agent IDs never decorate a node', () => { expect(executionProjection(agents, [event('unknown', 'in_flight')]).states).toEqual({}) })
  it('supports overlapping active Agents', () => { expect(executionProjection(agents, [event('manager', 'in_flight'), event('spec', 'in_flight')]).states).toEqual({manager:'running',spec:'running'}) })
  it('keeps an Agent running while another operation is active', () => { expect(executionProjection(agents, [event('manager','in_flight','a'), event('manager','in_flight','b'), event('manager','committed','a')]).states.manager).toBe('running') })
  it('review can resume a completed Agent', () => { const projected=executionProjection(agents,[event('manager','committed'),event('manager','in_flight','review')]); expect(projected.states.manager).toBe('running'); expect(projected.phases.manager).toBe('manager.review') })
  it('completed history has no running decoration', () => { expect(executionProjection(agents,[event('spec','in_flight'),event('spec','committed')],'completed').states).toEqual({spec:'completed'}) })
  it('Run completion does not imply untouched Agents worked', () => { expect(executionProjection(agents,[event('root','committed')],'completed').states.untouched).toBeUndefined() })
  it('settles only active Agents on failure', () => { expect(executionProjection(agents,[event('root','committed'),event('spec','in_flight')],'failed').states).toEqual({root:'completed',spec:'failed'}) })
  it('cancellation requested does not pretend cancelled', () => { expect(executionProjection(agents,[event('spec','in_flight')],'cancellation_requested').states.spec).toBe('running') })
  it('actual cancellation settles observed unfinished work', () => { expect(executionProjection(agents,[event('spec','in_flight')],'cancelled').states.spec).toBe('cancelled') })
  it('rejects operation events without identity', () => { expect(executionProjection(agents,[{...event('spec','in_flight'),payload:{}}]).states).toEqual({}) })
  it('durable replay deduplicates before projection', () => { const duplicate=event('spec','in_flight'); let model=reduceLive(emptyLiveModel,{event:duplicate}); model=reduceLive(model,{event:duplicate}); expect(model.events).toHaveLength(1) })
  it('structured JSON stays domain neutral', () => { expect(displayResult('{"items":[1,2]}')).toEqual({items:[1,2]}); expect(displayResult('plain result')).toBe('plain result') })
  it('only the current persisted input is recovered', () => { expect(inputText({input:'New independent input'})).toBe('New independent input') })
})

it('long Runs retain earlier Agent outcomes after the bounded timeline rolls over',()=>{let journal=reduceExecution(emptyExecutionJournal,event('spec','committed','done',1));for(let sequence=2;sequence<1500;sequence++)journal=reduceExecution(journal,{...event('root','in_flight','ignored',sequence),agent_id:null,type:'execution.checkpoint.saved'});expect(projectJournal(agents,journal,'completed').states.spec).toBe('completed');expect(journal.active).toEqual({})})

it.each(['completed', 'failed', 'cancelled'] as const)('clears stale phase detail for terminal %s without changing journal history', status => {
 const journal = [event('root', 'committed'), event('spec', 'in_flight')].reduce(reduceExecution, emptyExecutionJournal)
 const history = structuredClone(journal)
 const result = projectJournal(agents, journal, status)
 expect(result.phases).toEqual({})
 expect(result.states.root).toBe('completed')
 expect(result.states.spec).toBe(status === 'completed' ? 'idle' : status)
 expect(result.states.untouched).toBeUndefined()
 expect(journal).toEqual(history)
 expect(projectJournal(agents, journal, 'running').phases.spec).toBe('manager.review')
})

it('retains active phase detail while cancellation is requested', () => {
 expect(executionProjection(agents, [event('spec', 'in_flight')], 'cancellation_requested').phases.spec).toBe('manager.review')
})

it('keeps independent Provider waits until that exact request resumes',async()=>{
 const {waitingProviderRequests}=await import('@/lib/playground-execution')
 const traffic=(type:string,id:string,sequence:number)=>({type,sequence,agent_id:'same-agent',agent_name:'Same Agent',payload:{metadata:{traffic_request_id:id}},created_at:'2026-10-07T00:00:00Z'}) as LiveEvent
 const events=[traffic('provider.wait.started','a',1),traffic('provider.wait.started','b',2),traffic('provider.request.completed','a',3)]
 expect(waitingProviderRequests(events)).toHaveLength(1)
 expect(waitingProviderRequests([...events,traffic('provider.wait.resumed','b',4)])).toHaveLength(0)
})
