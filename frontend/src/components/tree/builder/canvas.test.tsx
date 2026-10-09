import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentType, ReactNode } from 'react'
import { BuilderCanvas } from './canvas'
import { addAgent, attachTool, autoLayout, newDocument, resourceId } from './model'
const graph = vi.hoisted(() => ({ props: {} as Record<string, unknown>, fit: vi.fn(), screen: vi.fn((p: unknown) => p), minimap: {} as Record<string, unknown> }))
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({children}:{children:ReactNode}) => children,
  ReactFlow: (p: {nodes:{id:string;type:string;data:Record<string,unknown>}[];nodeTypes:Record<string,ComponentType<Record<string,unknown>>>;children:ReactNode}) => { graph.props=p; return <div>{p.nodes.map(n=>{const Node=p.nodeTypes[n.type]; return <Node key={n.id} id={n.id} data={n.data} selected={false} />})}{p.children}</div> },
  Background:()=>null,BackgroundVariant:{Dots:'dots'},BaseEdge:()=>null,Controls:()=>null,Handle:(p:{id?:string;type?:string;isConnectable?:boolean})=><span data-testid="xy-handle" data-handle-id={p.id} data-handle-type={p.type} data-connectable={String(p.isConnectable !== false)} />,MiniMap:(p: Record<string, unknown>)=>{graph.minimap=p;return null},Position:{Top:'top',Bottom:'bottom',Right:'right'},
  useReactFlow:()=>({fitView:graph.fit,screenToFlowPosition:graph.screen}),getBezierPath:()=>['path'],
  applyNodeChanges:(changes:unknown,nodes:unknown)=>nodes,
}))
function props() { let document=addAgent(newDocument(),'root');document=addAgent(document,'manager',document.agents[0].id); return { snapshot:{document,positions:autoLayout(document),collapsed:[] as string[],hiddenResources:[] as string[]},tools:[],providers:[],issues:[],checked:true,onPositions:vi.fn(),onConnect:vi.fn(),onDisconnectResource:vi.fn(),onDrop:vi.fn(),onInspect:vi.fn(),onCollapse:vi.fn(),onReject:vi.fn(),onSelection:vi.fn(),fitToken:0 } }
describe('Builder canvas presentation and integration',()=>{
 it('renders actual Agent IDs and bindings, not Provider nodes',()=>{const p=props();render(<BuilderCanvas {...p} />);expect(screen.getByText('Root 1')).toBeVisible();const nodes=graph.props.nodes as {id:string;type:string}[];expect(nodes.map(n=>n.id)).toEqual(p.snapshot.document.agents.map(a=>a.id));expect(nodes.every(n=>n.type==='agent')).toBe(true)})
 it('retains XYFlow measurement updates so controlled nodes become visible',()=>{const p=props();render(<BuilderCanvas {...p} />);const change=graph.props.onNodesChange as (changes:unknown[])=>void;const stableHandler=graph.props.onNodesChange;fireEvent.click(screen.getByText('Root 1')); /* rendering remains stable */
   // ResizeObserver emits this event in the real browser.
   act(()=>change([{type:'dimensions',id:p.snapshot.document.agents[0].id,dimensions:{width:250,height:180}}])); expect((graph.props.nodes as {measured:{width:number;height:number}}[])[0].measured).toEqual({width:250,height:180}); expect(graph.props.onNodesChange).toBe(stableHandler)
 })
 it('uses solid hierarchy and dashed shared-resource assignment edges',()=>{const p=props();p.snapshot.document=attachTool(p.snapshot.document,p.snapshot.document.agents[0].id,'tool');p.tools=[{id:'tool',name:'Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];render(<BuilderCanvas {...p} />);const edges=graph.props.edges as {id:string;style?:{strokeDasharray?:string}}[];expect(edges.find(e=>e.id.startsWith('hierarchy:'))?.style).toBeUndefined();expect(edges.find(e=>e.id.startsWith('attachment:'))?.style?.strokeDasharray).toBe('4 5')})
 it('accepts only role-valid parent-to-child hierarchy handles',()=>{const p=props();render(<BuilderCanvas {...p} />);const valid=graph.props.isValidConnection as (c:unknown)=>boolean;expect(valid({source:p.snapshot.document.agents[0].id,target:p.snapshot.document.agents[1].id,sourceHandle:'hierarchy',targetHandle:'parent'})).toBe(true);expect(valid({source:p.snapshot.document.agents[1].id,target:p.snapshot.document.agents[0].id,sourceHandle:'hierarchy',targetHandle:'parent'})).toBe(false);expect(valid({source:p.snapshot.document.agents[0].id,target:p.snapshot.document.agents[1].id,sourceHandle:'resource',targetHandle:'parent'})).toBe(false)})
 it('surfaces backend issues without deciding readiness locally',()=>{const p=props();render(<BuilderCanvas {...p} issues={[{agent_id:p.snapshot.document.agents[1].id,step:'managers',code:'model_required',message:'Missing model'}]} />);expect(screen.getByText('1 issues')).toBeVisible()})
 it('shows hidden descendant count while retaining document nodes',()=>{const p=props();p.snapshot.collapsed=[p.snapshot.document.agents[0].id];render(<BuilderCanvas {...p} />);expect(screen.getByText('1 Agents hidden')).toBeVisible();expect((graph.props.nodes as {hidden:boolean}[])[1].hidden).toBe(true)})
 it('keeps inspect controls keyboard safe and opens details rather than immediate edit',()=>{const p=props();const ancestor=vi.fn();render(<div onKeyDown={ancestor}><BuilderCanvas {...p} /></div>);const button=screen.getByRole('button',{name:'Inspect Root 1'});fireEvent.keyDown(button,{key:'Enter'});expect(ancestor).not.toHaveBeenCalled();fireEvent.keyDown(button,{key:'z',ctrlKey:true});expect(ancestor).toHaveBeenCalledTimes(1);fireEvent.click(button);expect(p.onInspect).toHaveBeenCalledWith(p.snapshot.document.agents[0].id)})
 it('accepts controlled selection clearing from Escape and deletion',()=>{const p=props();const {rerender}=render(<BuilderCanvas {...p} selectedIds={[p.snapshot.document.agents[0].id]} />);expect((graph.props.nodes as {selected:boolean}[])[0].selected).toBe(true);rerender(<BuilderCanvas {...p} selectedIds={[]} />);expect((graph.props.nodes as {selected:boolean}[])[0].selected).toBe(false)})
 it('records keyboard position changes as completed history edits',()=>{const p=props();render(<BuilderCanvas {...p} />);const change=graph.props.onNodesChange as (changes:unknown[])=>void;act(()=>change([{type:'position',id:p.snapshot.document.agents[0].id,position:{x:30,y:40}}]));expect(p.onPositions).toHaveBeenCalledWith(expect.any(Object),true)})
 it('provides accessible empty-state creation and refits around the Root',()=>{const p=props();p.snapshot.document=newDocument();render(<BuilderCanvas {...p} />);fireEvent.click(screen.getByRole('button',{name:'Add Root'}));expect(p.onDrop).toHaveBeenCalledWith({kind:'agent',role:'root'},{x:0,y:0},undefined,true)})
})

it('renders one stable Tool node with multiple real assignment edges',()=>{const p=props();p.snapshot.document=addAgent(p.snapshot.document,'specialist',p.snapshot.document.agents[1].id);for(const agent of p.snapshot.document.agents)p.snapshot.document=attachTool(p.snapshot.document,agent.id,'tool');p.tools=[{id:'tool',name:'Shared Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];p.snapshot.positions[resourceId('tool')]={x:450,y:300};render(<BuilderCanvas {...p} />);const nodes=graph.props.nodes as {id:string;type:string}[];expect(nodes.filter(n=>n.id==='resource:tool')).toHaveLength(1);const edges=graph.props.edges as {source:string;target:string;id:string}[];expect(edges.filter(edge=>edge.target==='resource:tool')).toHaveLength(3);expect(screen.getByRole('button',{name:'Inspect Shared Tool'})).toBeVisible()})

it('permits an Agent-to-shared-resource edge only once and dispatches its real binding',()=>{const p=props();p.tools=[{id:'tool',name:'Shared Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];p.snapshot.positions[resourceId('tool')]={x:450,y:300};render(<BuilderCanvas {...p} />);const valid=graph.props.isValidConnection as (connection:unknown)=>boolean;const agent=p.snapshot.document.agents[0].id;const connection={source:agent,target:'resource:tool',sourceHandle:'resource',targetHandle:'resource-target'};expect(valid(connection)).toBe(true);act(()=>{(graph.props.onConnect as (c:{source:string;target:string;sourceHandle:string;targetHandle:string})=>void)(connection)});expect(p.onConnect).toHaveBeenCalledWith(agent,'resource:tool')})

it('deletes a resource edge as one Agent binding, never the shared resource',()=>{const p=props();p.snapshot.document=attachTool(p.snapshot.document,p.snapshot.document.agents[0].id,'tool');p.tools=[{id:'tool',name:'Shared Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];render(<BuilderCanvas {...p} />);const edge=(graph.props.edges as {id:string;source:string;target:string}[]).find(item=>item.id.startsWith('attachment:'))!;act(()=>{(graph.props.onEdgesDelete as (edges:typeof edge[])=>void)([edge])});expect(p.onDisconnectResource).toHaveBeenCalledWith(edge.source,'tool');expect(p.snapshot.document.tool_assignments).toHaveLength(1);expect(p.tools).toHaveLength(1)})

it('hides shared resource nodes and bindings visually without touching the document',()=>{const p=props();p.snapshot.document=attachTool(p.snapshot.document,p.snapshot.document.agents[0].id,'tool');p.tools=[{id:'tool',name:'Shared Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];p.snapshot.positions[resourceId('tool')]={x:450,y:300};render(<BuilderCanvas {...p} showTools={false} />);expect((graph.props.nodes as {id:string}[]).some(node=>node.id==='resource:tool')).toBe(false);expect(p.snapshot.document.tool_assignments).toHaveLength(1)})

it('renders a shared MCP connection once with its real ToolConnection ID',()=>{const p=props();p.snapshot.document=attachTool(p.snapshot.document,p.snapshot.document.agents[0].id,'mcp-id');p.snapshot.document=attachTool(p.snapshot.document,p.snapshot.document.agents[1].id,'mcp-id');p.tools=[{id:'mcp-id',name:'Monitoring MCP',tool_type:'mcp',enabled:true,status:'connected',discovered_tools:[]} as never];render(<BuilderCanvas {...p} />);expect((graph.props.nodes as {id:string}[]).filter(node=>node.id==='resource:mcp-id')).toHaveLength(1);expect((graph.props.edges as {target:string}[]).filter(edge=>edge.target==='resource:mcp-id')).toHaveLength(2);expect(screen.getByText('Monitoring MCP')).toBeVisible()})

it('keeps read-only shared-resource edge handles mounted but non-connectable',()=>{const p=props();const [root,manager]=p.snapshot.document.agents;p.snapshot.document=attachTool(p.snapshot.document,root.id,'tool');p.snapshot.document=attachTool(p.snapshot.document,manager.id,'tool');p.tools=[{id:'tool',name:'Shared Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];render(<BuilderCanvas {...p} readOnly />);const resourceHandles=screen.getAllByTestId('xy-handle').filter(handle=>handle.getAttribute('data-handle-id')==='resource');const targetHandles=screen.getAllByTestId('xy-handle').filter(handle=>handle.getAttribute('data-handle-id')==='resource-target');expect(resourceHandles).toHaveLength(2);expect(resourceHandles.every(handle=>handle.getAttribute('data-connectable')==='false')).toBe(true);expect(targetHandles).toHaveLength(1);expect(targetHandles[0].getAttribute('data-connectable')).toBe('false');const edges=graph.props.edges as {source:string;target:string;sourceHandle:string;targetHandle:string}[];expect(edges.filter(edge=>edge.sourceHandle==='resource'&&edge.targetHandle==='resource-target')).toHaveLength(2)})

it('omits read-only resource nodes and attachment edges together when filtered',()=>{const p=props();p.snapshot.document=attachTool(p.snapshot.document,p.snapshot.document.agents[0].id,'tool');p.tools=[{id:'tool',name:'Shared Tool',tool_type:'http_api',enabled:true,status:'connected',discovered_tools:[]} as never];render(<BuilderCanvas {...p} readOnly showTools={false} />);expect((graph.props.nodes as {id:string}[]).some(node=>node.id==='resource:tool')).toBe(false);expect((graph.props.edges as {id:string}[]).some(edge=>edge.id.startsWith('attachment:'))).toBe(false)})

it('observation mode disables mutation controls while preserving real ID decorations',()=>{const p=props();render(<BuilderCanvas {...p} readOnly executionByAgentId={{[p.snapshot.document.agents[0].id]:'running'}} />);expect(graph.props.nodesDraggable).toBe(false);expect(graph.props.nodesConnectable).toBe(false);expect(screen.queryByRole('button',{name:/Configure Root/})).not.toBeInTheDocument();expect(screen.getByText('Running')).toBeVisible();const change=graph.props.onNodesChange as (changes:unknown[])=>void;act(()=>change([{type:'position',id:p.snapshot.document.agents[0].id,position:{x:40,y:50}}]));expect(p.onPositions).not.toHaveBeenCalled()})


it('exposes resource types and preserves distinct role/resource minimap colors', () => {
 const p = props()
 p.snapshot.document = addAgent(p.snapshot.document, 'specialist', p.snapshot.document.agents[1].id)
 for (const id of ['tool', 'mcp']) p.snapshot.document = attachTool(p.snapshot.document, p.snapshot.document.agents[0].id, id)
 p.tools = [{ id: 'tool', name: 'Tool resource', tool_type: 'http_api' }, { id: 'mcp', name: 'MCP resource', tool_type: 'mcp' }] as never
 const { container } = render(<BuilderCanvas {...p} />)
 expect(container.querySelector('[data-resource-type="tool"]')).toBeInTheDocument()
 expect(container.querySelector('[data-resource-type="mcp"]')).toBeInTheDocument()
 const color = graph.minimap.nodeColor as (node: { type: string; data: Record<string, unknown> }) => string
 const nodes = graph.props.nodes as { type: string; data: Record<string, unknown> }[]
 expect(nodes.map(color)).toEqual(['var(--root-agent)', 'var(--manager-agent)', 'var(--specialist-agent)', 'var(--tool-resource, var(--info))', 'var(--mcp-resource, var(--earth))'])
})


it('uses vector configuration markers and preserves read-only execution labels', () => {
 const p = props()
 const { container, rerender } = render(<BuilderCanvas {...p} />)
 expect(container.querySelector('.lucide-circle-check')).toHaveAttribute('aria-hidden', 'true')
 expect(container.textContent).not.toMatch(/[⚠✓]/)
 rerender(<BuilderCanvas {...p} issues={[{ agent_id: p.snapshot.document.agents[0].id, step: 'root', code: 'model_required', message: 'Missing model' }]} />)
 expect(container.querySelector('.lucide-triangle-alert')).toHaveAttribute('aria-hidden', 'true')
 expect(screen.getByText('1 issues')).toBeVisible()
 rerender(<BuilderCanvas {...p} readOnly executionByAgentId={{ [p.snapshot.document.agents[0].id]: 'running' }} />)
 expect(screen.getByText('Running')).toBeVisible()
 expect(container.querySelector('.lucide-circle-check, .lucide-triangle-alert')).toBeNull()
})

it('uses distinct vector role icons with readable labels in editable and live graphs', () => {
 const p=props();p.snapshot.document=addAgent(p.snapshot.document,'specialist',p.snapshot.document.agents[1].id)
 const {container,rerender}=render(<BuilderCanvas {...p} />)
 for(const role of ['root','manager','specialist']) expect(container.querySelector(`[data-role-icon="${role}"]`)).toHaveAttribute('aria-hidden','true')
 expect(screen.getByText('root')).toBeVisible();expect(screen.getByText('manager')).toBeVisible();expect(screen.getByText('specialist')).toBeVisible()
 rerender(<BuilderCanvas {...p} readOnly executionByAgentId={{[p.snapshot.document.agents[0].id]:'completed'}} />)
 expect(container.querySelectorAll('[data-role-icon]')).toHaveLength(3);expect(screen.getByText('Completed')).toBeVisible()
})
