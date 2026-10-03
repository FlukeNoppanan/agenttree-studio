import type { AgentDraft, AgentType, TreeDetail, TreeDraftPayload } from '@/lib/api'
import { agentPayload, emptyAgent } from '../types'

export type Point = { x: number; y: number }
export type Positions = Record<string, Point>
export type ExecutionState = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export interface BuilderSnapshot { document: TreeDraftPayload; positions: Positions; collapsed: string[]; hiddenResources?: string[] }

/** Resource node identity follows the real resource ID, never an Agent assignment. */
export const resourceId = (agentOrToolId: string, toolId?: string) => `resource:${toolId ?? agentOrToolId}`
export const resourceToolId = (id: string) => id.startsWith('resource:') ? id.slice('resource:'.length) : null

export function treeDocument(tree: TreeDetail): TreeDraftPayload {
  return structuredClone({ name: tree.name, description: tree.description, template: tree.template,
    agents: tree.version.agents, tool_assignments: tree.version.tool_assignments,
    trigger: tree.version.trigger, output: tree.version.output })
}
export function newDocument(): TreeDraftPayload {
  return { name: 'Untitled Tree', description: '', template: 'blank', agents: [], tool_assignments: [], trigger: null, output: null }
}
export function addAgent(document: TreeDraftPayload, role: AgentType, parentId: string | null = null): TreeDraftPayload {
  if (role === 'root' && document.agents.some(a => a.agent_type === 'root')) throw new Error('rootExists')
  const agent = agentPayload(emptyAgent(`${role[0].toUpperCase()}${role.slice(1)} ${document.agents.filter(a => a.agent_type === role).length + 1}`), role, null)
  const next = { ...document, agents: [...document.agents, agent] }
  return parentId ? connectAgents(next, parentId, agent.id) : next
}
export function canConnect(document: TreeDraftPayload, source: string, target: string): boolean {
  const parent = document.agents.find(a => a.id === source), child = document.agents.find(a => a.id === target)
  return Boolean(parent && child && ((parent.agent_type === 'root' && child.agent_type === 'manager') || (parent.agent_type === 'manager' && child.agent_type === 'specialist')))
}
export function connectAgents(document: TreeDraftPayload, source: string, target: string): TreeDraftPayload {
  if (!canConnect(document, source, target)) throw new Error('invalidConnection')
  return { ...document, agents: document.agents.map(a => a.id === target ? { ...a, parent_agent_id: source } : a) }
}
export function attachTool(document: TreeDraftPayload, agentId: string, toolId: string): TreeDraftPayload {
  if (!document.agents.some(a => a.id === agentId)) throw new Error('dropOnAgent')
  if (document.tool_assignments.some(a => a.agent_config_id === agentId && a.tool_connection_id === toolId)) return document
  return { ...document, tool_assignments: [...document.tool_assignments, { agent_config_id: agentId, tool_connection_id: toolId }] }
}
export function detachTool(document: TreeDraftPayload, agentId: string, toolId: string): TreeDraftPayload {
  return { ...document, tool_assignments: document.tool_assignments.filter(a => !(a.agent_config_id === agentId && a.tool_connection_id === toolId)) }
}
export function descendants(document: TreeDraftPayload, ids: string[]): Set<string> {
  const removed = new Set(ids)
  let changed = true
  while (changed) { changed = false; for (const agent of document.agents) if (agent.parent_agent_id && removed.has(agent.parent_agent_id) && !removed.has(agent.id)) { removed.add(agent.id); changed = true } }
  return removed
}
export function deleteAgents(document: TreeDraftPayload, ids: string[]): TreeDraftPayload {
  const removed = descendants(document, ids)
  return { ...document, agents: document.agents.filter(a => !removed.has(a.id)).map(a => ({ ...a, settings: a.settings && Array.isArray(a.settings.allowed_manager_peer_ids) ? { ...a.settings, allowed_manager_peer_ids: a.settings.allowed_manager_peer_ids.filter(id => !removed.has(String(id))) } : a.settings })), tool_assignments: document.tool_assignments.filter(a => !removed.has(a.agent_config_id)) }
}

/** Lay out the canonical Agent hierarchy first, then unique shared resources in a separate side lane. */
export function autoLayout(document: TreeDraftPayload, extraResourceIds: string[] = []): Positions {
  const positions: Positions = {}, widths = new Map<string, number>()
  const children = (id: string) => document.agents.filter(a => a.parent_agent_id === id)
  const gap = 52, nodeWidth = 250, levelGap = 260
  const width = (agent: AgentDraft): number => {
    const childWidths = children(agent.id).map(width)
    const total = childWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, childWidths.length - 1) * gap
    const value = Math.max(nodeWidth, total)
    widths.set(agent.id, value); return value
  }
  const place = (agent: AgentDraft, x: number, y: number) => {
    const ownWidth = widths.get(agent.id) ?? nodeWidth
    positions[agent.id] = { x: x + (ownWidth - nodeWidth) / 2, y }
    const childNodes = children(agent.id), childWidths = childNodes.map(child => widths.get(child.id) ?? nodeWidth)
    const total = childWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, childWidths.length - 1) * gap
    let offset = x + (ownWidth - total) / 2
    childNodes.forEach((child, index) => { place(child, offset, y + levelGap); offset += childWidths[index] + gap })
  }
  let rootOffset = 0
  const roots = document.agents.filter(a => !a.parent_agent_id || !document.agents.some(parent => parent.id === a.parent_agent_id))
  roots.forEach(root => { width(root); place(root, rootOffset, 0); rootOffset += (widths.get(root.id) ?? nodeWidth) + 80 })
  const resources = [...new Set([...document.tool_assignments.map(a => resourceId(a.tool_connection_id)), ...extraResourceIds])].sort()
  if (resources.length) {
    const maxAgentY = Math.max(-levelGap, ...Object.values(positions).map(point => point.y))
    const resourceHeight = 88, resourceGap = 28
    const stackHeight = resources.length * resourceHeight + Math.max(0, resources.length - 1) * resourceGap
    const hierarchyBottom = maxAgentY + 220
    const startY = Math.max(0, (hierarchyBottom - stackHeight) / 2)
    const hierarchyRight = Math.max(0, rootOffset - 80)
    resources.forEach((id, index) => { positions[id] = { x: hierarchyRight + 88, y: startY + index * (resourceHeight + resourceGap) } })
  }
  return positions
}
export function layoutKey(userId: string, treeId: string, versionId: string): string { return `agenttree:builder-layout:v1:${userId}:${treeId}:${versionId}` }
export function readLayout(key: string): { positions: Positions; collapsed: string[]; hiddenResources: string[] } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    const positions: Positions = {}
    if (value.positions && typeof value.positions === 'object') for (const [id, p] of Object.entries(value.positions)) {
      if (p && typeof p === 'object' && 'x' in p && 'y' in p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e6 && Math.abs(p.y) < 1e6) positions[id] = { x: p.x, y: p.y }
    }
    return { positions, collapsed: Array.isArray(value.collapsed) ? value.collapsed.filter((v: unknown) => typeof v === 'string') : [], hiddenResources: Array.isArray(value.hiddenResources) ? value.hiddenResources.filter((v: unknown) => typeof v === 'string' && v.startsWith('resource:')) : [] }
  } catch { return { positions: {}, collapsed: [], hiddenResources: [] } }
}
export function writeLayout(key: string, positions: Positions, collapsed: string[], hiddenResources: string[] = []) {
  try { localStorage.setItem(key, JSON.stringify({ positions, collapsed, hiddenResources })) } catch { /* Storage is optional; document saving remains server-owned. */ }
}
