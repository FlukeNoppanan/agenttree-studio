import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Background, BackgroundVariant, BaseEdge, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, getBezierPath, useReactFlow, type Connection, type Edge, type EdgeProps, type ConnectionLineComponentProps, type FinalConnectionState, type Node, type NodeChange, type NodeProps, type NodeTypes, type OnConnectEnd } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CircleCheck, ChevronDown, ChevronRight, Cpu, Plug, Wrench } from 'lucide-react'
import { AgentRoleIcon } from '@/components/agent-role-icon'
import type { AgentType, ProviderConnection, ToolConnection, ValidationIssue } from '@/lib/api'
import { canConnect, descendants, resourceId, resourceToolId, type BuilderSnapshot, type ExecutionState, type Positions } from './model'
import '@xyflow/react/dist/style.css'
import './canvas.css'
export const DRAG_TYPE = 'application/agenttree-component'
export type PaletteItem = { kind: 'agent'; role: AgentType } | { kind: 'tool'; toolId: string }
export interface AgentNodeData extends Record<string, unknown> {
  role: AgentType; name: string; capabilities: string[]; provider?: string; model?: string | null; tools: number;
  issues: ValidationIssue[]; checked: boolean; executionState?: ExecutionState; executionPhase?: string; readOnly?: boolean; childCount: number; collapsed: boolean;
  contextMuted?: boolean; onCollapse: (id: string) => void; onInspect: (id: string) => void
}
type AgentNode = Node<AgentNodeData, 'agent'>
interface ResourceData extends Record<string, unknown> { name: string; mcp: boolean; ready?: boolean; assignedAgents: string[]; contextMuted?: boolean; readOnly?: boolean; onInspect: (id: string) => void }
const AgentCard = memo(function AgentCard({ id, data, selected }: NodeProps<AgentNode>) {
  const { t } = useTranslation()
  return <div className={`builder-agent builder-role-${data.role} ${selected ? 'is-selected' : ''} ${data.contextMuted ? 'builder-context-muted' : ''}`} data-agent-id={id} data-role={data.role} data-execution-state={data.executionState ?? 'idle'}>
    {data.role !== 'root' && <Handle type="target" position={Position.Top} id="parent" aria-label={t('builder.parentPort')} />}
    <div className="builder-node-heading"><span className="builder-role-icon"><AgentRoleIcon role={data.role} /></span><span className="text-xs font-semibold capitalize tracking-wide">{data.role}</span>{!data.readOnly && data.childCount > 0 && <button className="nodrag nopan ml-auto rounded p-1 hover:bg-accent" onKeyDown={e => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() }} onClick={e => { e.stopPropagation(); data.onCollapse(id) }} aria-label={t(data.collapsed ? 'builder.expand' : 'builder.collapse')}>{data.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>}</div>
    {data.readOnly ? <strong className="mt-2 block truncate text-sm">{data.name}</strong> : <button className="nodrag nopan mt-2 block w-full truncate text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('builder.inspectNode', { name: data.name })} onKeyDown={e => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() }} onClick={e => { e.stopPropagation(); data.onInspect(id) }}>{data.name}</button>}
    <p className="mt-1 truncate text-xs text-muted-foreground">{data.capabilities.slice(0, 2).join(' · ') || t('builder.noCapabilities')}</p>
    <div className="mt-3 flex items-start gap-2 border-t border-border pt-2"><Cpu size={14} className="mt-0.5 shrink-0 text-muted-foreground" /><div className="min-w-0 text-xs"><span className="block truncate text-muted-foreground">{data.provider ?? t('builder.noProvider')}</span><span className="block truncate">{data.model ?? t('builder.noModel')}</span></div></div>
    {!data.readOnly && <div className="mt-3 flex items-center justify-between text-xs"><span className={`inline-flex items-center gap-1 ${data.issues.length ? 'text-warning' : 'text-muted-foreground'}`}>{data.checked ? data.issues.length ? <><AlertTriangle size={14} aria-hidden="true" />{data.issues.length} {t('builder.issues')}</> : <><CircleCheck size={14} aria-hidden="true" />{t('builder.configured')}</> : t('builder.checking')}</span><span className="inline-flex items-center gap-1 text-muted-foreground"><Wrench size={12} aria-hidden="true" />{data.tools} Tools</span></div>}
    {data.readOnly && <div className="playground-node-status" role="status"><span>{t(`playground.states.${data.executionState ?? 'idle'}`)}</span>{data.executionPhase && <span className="truncate text-xs text-muted-foreground">{t(`playground.phases.${data.executionPhase.replaceAll('.', '_')}`, { defaultValue: data.executionPhase })}</span>}</div>}
    {data.collapsed && <span className="mt-2 block text-xs text-muted-foreground">{t('builder.hidden', { count: data.childCount })}</span>}
    {data.role !== 'specialist' && <Handle type="source" position={Position.Bottom} id="hierarchy" aria-label={t('builder.childPort')} />}
    <Handle type="source" position={Position.Right} id="resource" isConnectable={!data.readOnly} className="builder-resource-handle" aria-label={t('builder.resourcePort')} />
  </div>
})
const ResourceCard = memo(function ResourceCard({ id, data, selected }: NodeProps<Node<ResourceData>>) {
  const { t } = useTranslation()
  return <div className={`builder-resource ${selected ? 'is-selected' : ''} ${data.contextMuted ? 'builder-context-muted' : ''}`} data-resource-type={data.mcp ? 'mcp' : 'tool'}><Handle type="target" position={Position.Left} id="resource-target" isConnectable={!data.readOnly} aria-label={t('builder.resourceTargetPort')} /><button type="button" disabled={data.readOnly} className="nodrag nopan w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('builder.inspectNode', { name: data.name })} onClick={e => { e.stopPropagation(); data.onInspect(id) }}><span className="flex items-center gap-2">{data.mcp ? <Plug size={16} /> : <Wrench size={16} />}<strong className="truncate text-xs">{data.name}</strong>{!data.readOnly && data.ready !== undefined && <span className={`ml-auto size-1.5 shrink-0 rounded-full ${data.ready ? 'bg-success' : 'bg-warning'}`} />}</span><span className="mt-1 block text-xs text-muted-foreground">{data.mcp ? 'MCP' : 'Tool'} · {t('builder.agentCount', { count: data.assignedAgents.length })}</span></button></div>
})
const nodeTypes: NodeTypes = { agent: AgentCard, resource: ResourceCard }
function StructureEdge(props: EdgeProps) { const [path] = getBezierPath(props); return <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} markerStart={props.markerStart} /> }
function ConnectionPreview({ fromX, fromY, toX, toY, fromPosition, toPosition, connectionStatus }: ConnectionLineComponentProps) {
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition, targetPosition: toPosition })
  return <path d={path} fill="none" stroke={connectionStatus === 'invalid' ? 'var(--danger)' : 'var(--primary)'} strokeWidth={2} />
}
const edgeTypes = { structure: StructureEdge }
interface Props {
  snapshot: BuilderSnapshot; tools: ToolConnection[]; providers: ProviderConnection[]; issues: ValidationIssue[]; checked: boolean;
  executionByAgentId?: Record<string, ExecutionState>; executionPhases?: Record<string, string>; readOnly?: boolean;
  onPositions: (positions: Positions, finished: boolean) => void;
  onConnect: (source: string, target: string) => void; onDisconnectResource: (agentId: string, toolId: string) => void;
  onDrop: (item: PaletteItem, point: { x: number; y: number }, target?: string, fit?: boolean) => void;
  onInspect: (id: string) => void; onCollapse: (id: string) => void; onReject: () => void;
  onSelection: (ids: string[]) => void; selectedIds?: string[]; configuredId?: string | null; fitToken: number; pulseTarget?: string;
  showTools?: boolean; showMcp?: boolean
}
function InnerCanvas(props: Props) {
  const { t } = useTranslation(), flow = useReactFlow(), [dragging, setDragging] = useState(false)
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({})
  const [localSelected, setSelected] = useState<string[]>([])
  const selected = props.selectedIds ?? localSelected
  const snapshotRef = useRef(props.snapshot); snapshotRef.current = props.snapshot
  const propsRef = useRef(props); propsRef.current = props
  const inspect = useCallback((id: string) => { setSelected([id]); propsRef.current.onSelection([id]); propsRef.current.onInspect(id) }, [])
  const collapse = useCallback((id: string) => propsRef.current.onCollapse(id), [])
  const focusId = selected.length === 1 ? selected[0] : null
  const focusToolId = focusId ? resourceToolId(focusId) : null
  const graph = useMemo(() => {
    const { document, positions, collapsed, hiddenResources: hiddenResourceIds = [] } = props.snapshot
    const hidden = new Set<string>()
    for (const id of collapsed) for (const child of descendants(document, [id])) if (child !== id) hidden.add(child)
    const focusAgent = focusId ? document.agents.find(agent => agent.id === focusId) : undefined
    const relatedAgentIds = new Set<string>(), relatedResourceIds = new Set<string>()
    if (focusAgent) {
      relatedAgentIds.add(focusAgent.id)
      if (focusAgent.parent_agent_id) relatedAgentIds.add(focusAgent.parent_agent_id)
      for (const child of document.agents) if (child.parent_agent_id === focusAgent.id) relatedAgentIds.add(child.id)
      for (const binding of document.tool_assignments) if (binding.agent_config_id === focusAgent.id) relatedResourceIds.add(resourceId(binding.tool_connection_id))
    }
    if (focusToolId) for (const binding of document.tool_assignments) if (binding.tool_connection_id === focusToolId) relatedAgentIds.add(binding.agent_config_id)
    const nodes: Node[] = document.agents.map(agent => ({
      id: agent.id, type: 'agent', position: positions[agent.id] ?? { x: 0, y: 0 }, hidden: hidden.has(agent.id),
      data: { role: agent.agent_type, name: agent.name, capabilities: agent.capabilities, model: agent.model_id,
        provider: props.providers.find(p => p.id === agent.provider_connection_id)?.name ?? (agent.provider_connection_id ? t('playground.assignedProvider') : undefined),
        tools: document.tool_assignments.filter(a => a.agent_config_id === agent.id).length,
        issues: props.issues.filter(i => i.agent_id === agent.id), checked: props.checked, readOnly: props.readOnly, executionPhase: props.executionPhases?.[agent.id], executionState: props.executionByAgentId?.[agent.id],
        childCount: descendants(document, [agent.id]).size - 1, collapsed: collapsed.includes(agent.id), contextMuted: Boolean(focusId && (focusToolId ? !relatedAgentIds.has(agent.id) : focusAgent && !relatedAgentIds.has(agent.id))), onCollapse: collapse, onInspect: inspect },
    }))
    const assignedResourceIds = document.tool_assignments.map(binding => resourceId(binding.tool_connection_id))
    const positionedResourceIds = Object.keys(positions).filter(id => id.startsWith('resource:'))
    const hiddenResources = new Set(hiddenResourceIds)
    const resourceIds = [...new Set([...assignedResourceIds, ...positionedResourceIds])].filter(id => {
      const toolId = resourceToolId(id), tool = props.tools.find(entry => entry.id === toolId)
      if (hiddenResources.has(id) || !tool) return false
      return tool.tool_type === 'mcp' ? props.showMcp !== false : props.showTools !== false
    })
    for (const id of resourceIds) {
      const toolId = resourceToolId(id)!, tool = props.tools.find(entry => entry.id === toolId)
      const assignments = document.tool_assignments.filter(binding => binding.tool_connection_id === toolId)
      const hiddenByAgent = assignments.length > 0 && assignments.every(binding => hidden.has(binding.agent_config_id))
      nodes.push({ id, type: 'resource', position: positions[id] ?? { x: 0, y: 300 }, hidden: hiddenByAgent, data: { id: toolId, readOnly: props.readOnly, name: tool?.name ?? t('builder.assignedTool'), mcp: tool?.tool_type === 'mcp', ready: tool ? Boolean(tool.enabled && tool.status === 'connected') : undefined, assignedAgents: assignments.map(binding => document.agents.find(agent => agent.id === binding.agent_config_id)?.name ?? binding.agent_config_id), contextMuted: Boolean(focusId && (focusToolId ? id !== focusId : focusAgent && !relatedResourceIds.has(id))), onInspect: inspect } })
    }
    const visibleIds = new Set(nodes.map(node => node.id))
    const edges: Edge[] = document.agents.filter(agent => agent.parent_agent_id).map(agent => ({ id: `hierarchy:${agent.id}`, type: 'structure', source: agent.parent_agent_id!, target: agent.id, sourceHandle: 'hierarchy', targetHandle: 'parent', className: `${agent.id === props.pulseTarget ? 'builder-edge-pulse' : ''} ${focusToolId ? '' : focusAgent && agent.id !== focusAgent.id && agent.parent_agent_id !== focusAgent.id && agent.id !== focusAgent.parent_agent_id ? 'builder-context-muted' : ''}` }))
    for (const binding of document.tool_assignments) {
      const id = resourceId(binding.tool_connection_id)
      if (visibleIds.has(id)) { const edgeId = `attachment:${binding.agent_config_id}:${binding.tool_connection_id}`; const related = focusToolId ? id === focusId : focusAgent ? binding.agent_config_id === focusAgent.id : true; edges.push({ id: edgeId, source: binding.agent_config_id, target: id, sourceHandle: 'resource', targetHandle: 'resource-target', style: { strokeDasharray: '4 5', strokeWidth: 1.4 }, className: `builder-resource-edge ${props.pulseTarget === edgeId ? 'builder-edge-pulse' : ''} ${focusId && !related ? 'builder-context-muted' : ''}`, deletable: !props.readOnly, selectable: !props.readOnly }) }
    }
    return { nodes, edges }
  }, [props.snapshot.document, props.snapshot.positions, props.snapshot.collapsed, props.snapshot.hiddenResources, props.tools, props.providers, props.issues, props.checked, props.readOnly, props.executionByAgentId, props.executionPhases, props.showTools, props.showMcp, props.pulseTarget, focusId, focusToolId, t, collapse, inspect])
  const { nodes, edges } = graph
  // Controlled selection is local to the canvas, while document/layout remain owned by the editor.
  const selectedNodes = useMemo(() => nodes.map(n => ({ ...n, measured: dimensions[n.id], selected: selected.includes(n.id) || n.id === props.configuredId })), [nodes, selected, dimensions, props.configuredId])
  const selectedNodesRef = useRef(selectedNodes); selectedNodesRef.current = selectedNodes
  const ariaLabels = useMemo(() => ({ 'controls.zoomIn.ariaLabel': t('builder.zoomIn'), 'controls.zoomOut.ariaLabel': t('builder.zoomOut'), 'controls.fitView.ariaLabel': t('builder.fit'), 'minimap.ariaLabel': t('builder.minimap'), 'node.a11yDescription.default': t('builder.keyboardNodes') }), [t])
  const fitViewOptions = useMemo(() => ({ maxZoom: 1, padding: .15 }), [])
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (changes.some(change => change.type === 'dimensions')) setDimensions(previous => {
      const next = { ...previous }; let changed = false
      for (const change of changes) if (change.type === 'dimensions' && change.dimensions && (previous[change.id]?.width !== change.dimensions.width || previous[change.id]?.height !== change.dimensions.height)) { next[change.id] = change.dimensions; changed = true }
      return changed ? next : previous
    })
    const moved = applyNodeChanges(changes, selectedNodesRef.current), positions = { ...snapshotRef.current.positions }
    for (const node of moved) positions[node.id] = node.position
    if (!propsRef.current.readOnly && changes.some(change => change.type === 'position')) propsRef.current.onPositions(positions, changes.some(change => change.type === 'position' && change.dragging !== true))
    if (changes.some(change => change.type === 'select')) { const ids = moved.filter(node => node.selected).map(node => node.id); setSelected(ids); propsRef.current.onSelection(ids) }
  }, [])
  const onNodeDragStop = useCallback((_: unknown, __: Node, dragged: Node[]) => { if (propsRef.current.readOnly) return; const positions = { ...snapshotRef.current.positions }; for (const node of dragged) positions[node.id] = node.position; propsRef.current.onPositions(positions, true) }, [])
  const onNodeClick = useCallback((event: ReactMouseEvent, node: Node) => { if (!propsRef.current.readOnly && !event.shiftKey) inspect(node.id) }, [inspect])
  const onSelectionChange = useCallback(({ nodes: selectedNodesNow, edges: selectedEdgesNow }: { nodes: Node[]; edges: Edge[] }) => {
    if (!propsRef.current.readOnly) { const ids = [...selectedNodesNow.map(node => node.id), ...selectedEdgesNow.map(edge => edge.id)]; setSelected(ids); propsRef.current.onSelection(ids) }
  }, [])
  const isValidConnection = useCallback((connection: Edge | Connection) => {
    if (!connection.source || !connection.target) return false
    const current = propsRef.current, toolId = resourceToolId(connection.target)
    if (toolId) return connection.sourceHandle === 'resource' && current.tools.some(tool => tool.id === toolId) && !current.snapshot.document.tool_assignments.some(binding => binding.agent_config_id === connection.source && binding.tool_connection_id === toolId) && current.snapshot.document.agents.some(agent => agent.id === connection.source)
    return connection.sourceHandle === 'hierarchy' && connection.targetHandle === 'parent' && canConnect(current.snapshot.document, connection.source, connection.target)
  }, [])
  const onConnect = useCallback((connection: Connection) => { if (!propsRef.current.readOnly && connection.source && connection.target) propsRef.current.onConnect(connection.source, connection.target) }, [])
  const onConnectEnd = useCallback<OnConnectEnd>((_: MouseEvent | TouchEvent, state: FinalConnectionState) => { if (state.toNode && !state.isValid) propsRef.current.onReject() }, [])
  const onEdgesDelete = useCallback((removed: Edge[]) => {
    const current = propsRef.current
    if (current.readOnly) return
    for (const edge of removed) {
      if (edge.id.startsWith('hierarchy:')) current.onConnect('', edge.target)
      else if (edge.id.startsWith('attachment:')) { const toolId = resourceToolId(edge.target); if (toolId) current.onDisconnectResource(edge.source, toolId) }
    }
  }, [])
  useEffect(() => { if (props.fitToken > 0) void flow.fitView({ duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320, padding: .15, maxZoom: 1 }) }, [props.fitToken, flow])
  return <div className={`builder-canvas ${props.readOnly ? 'playground-observer' : ''} ${dragging ? 'is-drop-active' : ''}`} onDragOver={e => { if (!props.readOnly && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true) } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) setDragging(false) }} onDrop={e => { if (props.readOnly) return; e.preventDefault(); setDragging(false); try { const raw = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); if (raw.kind !== 'agent' && raw.kind !== 'tool') return; if (raw.kind === 'agent' && !['root', 'manager', 'specialist'].includes(raw.role)) return; if (raw.kind === 'tool' && !props.tools.some(t => t.id === raw.toolId)) return; const target = (e.target as HTMLElement).closest('[data-agent-id]')?.getAttribute('data-agent-id') ?? undefined; props.onDrop(raw, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }), target) } catch { props.onReject() } }}>
    <ReactFlow nodesDraggable={!props.readOnly} nodesConnectable={!props.readOnly} elementsSelectable={!props.readOnly} nodesFocusable={!props.readOnly} edgesFocusable={!props.readOnly} nodes={selectedNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionLineComponent={ConnectionPreview} ariaLabelConfig={ariaLabels} fitView fitViewOptions={fitViewOptions} minZoom={props.readOnly ? .08 : .15} maxZoom={2} deleteKeyCode={null} selectionOnDrag selectionKeyCode="Shift" multiSelectionKeyCode="Shift" panOnDrag={[0, 1, 2]} panOnScroll zoomOnScroll onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick} onSelectionChange={onSelectionChange} isValidConnection={isValidConnection} onConnect={onConnect} onConnectEnd={onConnectEnd} onEdgesDelete={onEdgesDelete}>
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls showInteractive={false} fitViewOptions={{ duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 }} />
      {(!props.readOnly || nodes.length > 10) && <MiniMap pannable zoomable nodeColor={node => node.type === 'resource'
        ? node.data.mcp ? 'var(--mcp-resource, var(--earth))' : 'var(--tool-resource, var(--info))'
        : `var(--${node.data.role}-agent)`} />}
      {!props.readOnly && nodes.length === 0 && <div className="builder-empty"><span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-primary">Root → Manager → Specialist</span><h2 className="text-xl font-semibold">{t('builder.emptyTitle')}</h2><p className="mt-2 max-w-xs text-sm text-muted-foreground">{t('builder.emptyDescription')}</p><button className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => props.onDrop({ kind: 'agent', role: 'root' }, { x: 0, y: 0 }, undefined, true)}>{t('builder.addRoot')}</button></div>}
    </ReactFlow>
  </div>
}
export const BuilderCanvas = memo(function BuilderCanvas(props: Props) { return <ReactFlowProvider><InnerCanvas {...props} /></ReactFlowProvider> })
