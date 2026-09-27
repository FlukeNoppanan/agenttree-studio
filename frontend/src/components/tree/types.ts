import type {
  AgentDraft,
  OutputDraft,
  TreeDetail,
  TreeDraftPayload,
  TriggerDraft,
} from "@/lib/api"
import { generateClientId } from "@/lib/client-id"

export interface WizardAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  provider_connection_id: string | null
  model_id: string | null
  system_instruction: string
  review_enabled: boolean
  tool_connection_ids: string[]
  allowed_manager_peer_ids: string[]
  max_manager_revisions: number
  max_final_revisions: number
  max_tool_rounds: number
  max_runtime_tool_calls: number
  max_collaboration_messages_per_manager: number
  max_collaboration_messages_total: number
  provider_streaming: boolean
  autonomous_tool_use: boolean
  max_tool_iterations: number
  max_tool_calls: number
  tool_loop_timeout_seconds: number
}

export interface WizardManager {
  agent: WizardAgent
  specialists: WizardAgent[]
}

export interface ManualField {
  id: string
  name: string
  type: "text" | "textarea" | "number" | "select" | "file"
  required: boolean
  options: string[]
}

export interface WizardState {
  name: string
  description: string
  template: string
  root: WizardAgent
  managers: WizardManager[]
  triggerType: "manual_form" | "webhook" | null
  manualFields: ManualField[]
  outputType: "text" | "structured_json" | null
  deliveryType: "show_in_web" | "api_response" | null
}

export function emptyAgent(name = ""): WizardAgent {
  return {
    id: generateClientId(),
    name,
    description: "",
    capabilities: [],
    provider_connection_id: null,
    model_id: null,
    system_instruction: "",
    review_enabled: true,
    tool_connection_ids: [],
    allowed_manager_peer_ids: [],
    max_manager_revisions: 2,
    max_final_revisions: 1,
    max_tool_rounds: 3,
    max_runtime_tool_calls: 8,
    max_collaboration_messages_per_manager: 4,
    max_collaboration_messages_total: 12,
    provider_streaming: true,
    autonomous_tool_use: false,
    max_tool_iterations: 5,
    max_tool_calls: 5,
    tool_loop_timeout_seconds: 60,
  }
}

export function emptyWizard(): WizardState {
  return {
    name: "",
    description: "",
    template: "blank",
    root: emptyAgent("Root Agent"),
    managers: [],
    triggerType: null,
    manualFields: [],
    outputType: null,
    deliveryType: null,
  }
}

function fromAgent(agent: AgentDraft, assignments: Map<string, string[]>): WizardAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    provider_connection_id: agent.provider_connection_id,
    model_id: agent.model_id,
    system_instruction: agent.system_instruction ?? "",
    review_enabled: Boolean(
      agent.settings?.review_enabled ?? agent.settings?.final_review_enabled ?? true,
    ),
    tool_connection_ids: assignments.get(agent.id) ?? [],
    allowed_manager_peer_ids: Array.isArray(agent.settings?.allowed_manager_peer_ids) ? agent.settings.allowed_manager_peer_ids as string[] : [],
    max_manager_revisions: Number(agent.settings?.max_manager_revisions ?? 2),
    max_final_revisions: Number(agent.settings?.max_final_revisions ?? 1),
    max_tool_rounds: Number(agent.settings?.max_tool_rounds ?? 3),
    max_runtime_tool_calls: Number(agent.settings?.max_tool_calls ?? 8),
    max_collaboration_messages_per_manager: Number(agent.settings?.max_collaboration_messages_per_manager ?? 4),
    max_collaboration_messages_total: Number(agent.settings?.max_collaboration_messages_total ?? 12),
    provider_streaming: Boolean(agent.settings?.provider_streaming ?? true),
    autonomous_tool_use: Boolean(agent.settings?.autonomous_tool_use ?? false),
    max_tool_iterations: Number(agent.settings?.max_tool_iterations ?? 5),
    max_tool_calls: Number(agent.settings?.max_tool_calls ?? 5),
    tool_loop_timeout_seconds: Number(agent.settings?.tool_loop_timeout_seconds ?? 60),
  }
}

export function wizardFromTree(tree: TreeDetail): WizardState {
  const assignments = new Map<string, string[]>()
  tree.version.tool_assignments.forEach((assignment) => {
    assignments.set(assignment.agent_config_id, [
      ...(assignments.get(assignment.agent_config_id) ?? []),
      assignment.tool_connection_id,
    ])
  })
  const root = tree.version.agents.find((agent) => agent.agent_type === "root")
  const managerAgents = tree.version.agents.filter((agent) => agent.agent_type === "manager")
  const fields = tree.version.trigger?.trigger_type === "manual_form"
    ? (tree.version.trigger.config.fields as ManualField[] | undefined) ?? []
    : []
  return {
    name: tree.name,
    description: tree.description,
    template: tree.template,
    root: root ? fromAgent(root, assignments) : emptyAgent("Root Agent"),
    managers: managerAgents.map((manager) => ({
      agent: fromAgent(manager, assignments),
      specialists: tree.version.agents
        .filter((agent) => agent.agent_type === "specialist" && agent.parent_agent_id === manager.id)
        .map((agent) => fromAgent(agent, assignments)),
    })),
    triggerType: tree.version.trigger?.trigger_type === "webhook" ? "webhook" : tree.version.trigger?.trigger_type === "manual_form" ? "manual_form" : null,
    manualFields: fields,
    outputType: tree.version.output?.output_type === "structured_json" ? "structured_json" : tree.version.output?.output_type === "text" ? "text" : null,
    deliveryType: tree.version.output?.delivery_type === "api_response" ? "api_response" : tree.version.output?.delivery_type === "show_in_web" ? "show_in_web" : null,
  }
}

function agentPayload(
  agent: WizardAgent,
  agentType: AgentDraft["agent_type"],
  parentAgentId: string | null,
): AgentDraft {
  const settings = agentType === "root"
    ? { final_review_enabled: agent.review_enabled, max_manager_revisions: agent.max_manager_revisions,
      max_final_revisions: agent.max_final_revisions, max_tool_rounds: agent.max_tool_rounds,
      max_tool_calls: agent.max_runtime_tool_calls,
      max_collaboration_messages_per_manager: agent.max_collaboration_messages_per_manager,
      max_collaboration_messages_total: agent.max_collaboration_messages_total,
      provider_streaming: agent.provider_streaming }
    : agentType === "manager" ? { review_enabled: agent.review_enabled, allowed_manager_peer_ids: agent.allowed_manager_peer_ids } : {
      autonomous_tool_use: agent.autonomous_tool_use,
      max_tool_iterations: agent.max_tool_iterations,
      max_tool_calls: agent.max_tool_calls,
      tool_loop_timeout_seconds: agent.tool_loop_timeout_seconds,
    }
  return {
    id: agent.id,
    agent_type: agentType,
    name: agent.name,
    description: agent.description,
    parent_agent_id: parentAgentId,
    provider_connection_id: agent.provider_connection_id,
    model_id: agent.model_id,
    system_instruction: agent.system_instruction || null,
    capabilities: agent.capabilities,
    settings,
  }
}

export function wizardPayload(state: WizardState): TreeDraftPayload {
  const agents: AgentDraft[] = [agentPayload(state.root, "root", null)]
  const toolAssignments: TreeDraftPayload["tool_assignments"] = []
  state.root.tool_connection_ids.forEach((toolId) => toolAssignments.push({
    agent_config_id: state.root.id, tool_connection_id: toolId,
  }))
  state.managers.forEach((manager) => {
    agents.push(agentPayload(manager.agent, "manager", state.root.id))
    manager.agent.tool_connection_ids.forEach((toolId) => toolAssignments.push({
      agent_config_id: manager.agent.id,
      tool_connection_id: toolId,
    }))
    manager.specialists.forEach((specialist) => {
      agents.push(agentPayload(specialist, "specialist", manager.agent.id))
      specialist.tool_connection_ids.forEach((toolId) => toolAssignments.push({
        agent_config_id: specialist.id,
        tool_connection_id: toolId,
      }))
    })
  })
  const trigger: TriggerDraft | null = state.triggerType === "manual_form"
    ? { trigger_type: "manual_form", config: { fields: state.manualFields } }
    : state.triggerType === "webhook" ? { trigger_type: "webhook", config: {} } : null
  const output: OutputDraft | null = state.outputType && state.deliveryType ? {
    output_type: state.outputType,
    delivery_type: state.deliveryType,
    config: {},
  } : null
  return {
    name: state.name,
    description: state.description,
    template: state.template,
    agents,
    tool_assignments: toolAssignments,
    trigger,
    output,
  }
}
