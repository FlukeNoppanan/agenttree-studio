export type ProviderType = "openai" | "gemini" | "ollama"
export type ProviderStatus = "not_configured" | "testing" | "connected" | "error"

export interface Secret {
  id: string
  name: string
  secret_type: string
  masked_value: string
  created_at: string
  updated_at: string
}

export interface ProviderConnection {
  id: string
  name: string
  provider_type: ProviderType
  secret_id: string | null
  base_url: string | null
  status: ProviderStatus
  last_checked_at: string | null
  last_error: string | null
  models_count: number
  discovered_models_count: number
  unavailable_models_count: number
  transient_models_count: number
  created_at: string
  updated_at: string
}

export interface ProviderModel {
  id: string
  provider_connection_id: string
  model_id: string
  display_name: string | null
  metadata: Record<string, unknown> | null
  is_available: boolean
  generation_candidate: boolean
  qualification_status: "unknown" | "qualified" | "unavailable" | "transient_error"
  qualification_checked_at: string | null
  qualification_error_code: string | null
  qualification_message: string | null
  discovered_at: string
}

export interface ProviderPayload {
  name: string
  provider_type: ProviderType
  secret_id: string | null
  base_url: string | null
}

export interface DiscoveryResponse {
  provider: ProviderConnection
  models: ProviderModel[]
  summary: {
    discovered_count: number
    candidate_count: number
    usable_count: number
    unavailable_count: number
    transient_error_count: number
  }
}

export interface DashboardSummary {
  metrics: {
    trees: { total: number; ready: number; draft: number }
    runs: { total: number; today: number; running: number; completed: number; failed: number; success_rate: number | null }
    providers: { total: number; connected: number; usable_models: number }
    tools: { total: number; connected: number; enabled: number }
  }
  recent_runs: Array<{ id: string; tree_id: string; tree_name: string; status: RunStatus; started_at: string; duration_ms: number | null; result_state: string | null }>
  trees: Array<{ id: string; name: string; description: string; status: TreeStatus; agent_count: number; run_count: number; last_run_at: string | null; provider_summary: string[] }>
  providers: Array<{ id: string; name: string; provider_type: ProviderType; status: ProviderStatus; usable_models: number; unavailable_models: number; last_checked_at: string | null }>
  needs_attention: Array<{ id: string; kind: string; severity: string; title: string; message: string; resource_name: string; related_names: string[]; action_label: string; action_href: string }>
}

export interface SystemHealth {
  status: "ok" | "degraded"
  studio_api: { available: boolean; version: string | null; detail: string | null }
  agenttree: { available: boolean; version: string | null; error: string | null }
  database: { available: boolean; version: string | null; detail: string | null }
  migrations: { current: string | null; head: string | null; up_to_date: boolean }
  backend_version: string
  frontend_version: string
  runtime: { python_version: string; platform: string }
}

export type TreeStatus = "draft" | "ready" | "published" | "paused" | "archived"
export type AgentType = "root" | "manager" | "specialist"

export interface AgentDraft {
  id: string
  agent_type: AgentType
  name: string
  description: string
  parent_agent_id: string | null
  provider_connection_id: string | null
  model_id: string | null
  system_instruction: string | null
  capabilities: string[]
  settings: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export interface TriggerDraft {
  trigger_type: "manual_form" | "webhook"
  config: Record<string, unknown>
}

export interface OutputDraft {
  output_type: "text" | "structured_json"
  delivery_type: "show_in_web" | "api_response"
  config: Record<string, unknown>
}

export interface ToolAssignment {
  agent_config_id: string
  tool_connection_id: string
}

export interface TreeDraftPayload {
  name: string
  description: string
  template: string
  agents: AgentDraft[]
  tool_assignments: ToolAssignment[]
  trigger: TriggerDraft | null
  output: OutputDraft | null
}

export interface TreeVersion {
  id: string
  tree_id: string
  version_number: number
  status: string
  agents: AgentDraft[]
  tool_assignments: ToolAssignment[]
  trigger: TriggerDraft | null
  output: OutputDraft | null
  created_at: string
  updated_at: string
}

export interface TreeListItem {
  id: string
  name: string
  description: string
  status: TreeStatus
  version_number: number
  managers_count: number
  specialists_count: number
  updated_at: string
}

export interface TreeDetail extends TreeListItem {
  template: string
  current_version_id: string
  root: AgentDraft | null
  provider_usage: string[]
  trigger_type: string | null
  output_type: string | null
  version: TreeVersion
  created_at: string
}

export interface ValidationIssue {
  step: string
  code: string
  message: string
  agent_id: string | null
}

export interface TreeValidation {
  valid: boolean
  errors: ValidationIssue[]
  validated_at: string
}

export interface ToolConnection {
  id: string
  name: string
  tool_type: "http_api" | "mcp"
  description: string
  enabled: boolean
  secret_id: string | null
  transport_type: "stdio" | "streamable_http" | null
  status: "not_configured" | "connected" | "error" | "disabled"
  configuration: Record<string, unknown>
  discovered_tools: DiscoveredTool[]
  assigned_agents_count: number
  last_checked_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface DiscoveredTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  metadata: Record<string, unknown>
  selected: boolean
}

export interface ToolPayload {
  name: string
  description: string
  tool_type: "http_api" | "mcp"
  enabled: boolean
  secret_id: string | null
  transport_type: "stdio" | "streamable_http" | null
  configuration: Record<string, unknown>
}

export interface ToolAssignmentInfo {
  agent_id: string
  agent_name: string
  tree_id: string
  tree_name: string
}

export interface ToolExecution {
  tool_id: string
  success: boolean
  output: unknown
  error: string | null
  metadata: Record<string, unknown>
  trace: Array<{ event_type: string; actor_id: string | null; message: string; metadata: Record<string, unknown>; timestamp: string }>
}

export interface CapabilityCatalogItem {
  id: string
  label: string
  usage_count: number
}

export interface CapabilitySuggestion {
  id: string
  label: string
  reason: string
}

export interface CapabilitySuggestionPayload {
  agent_type: AgentType
  name: string
  description: string
  system_instruction: string | null
  provider_connection_id: string
  model_id: string
}

export type RunStatus = "pending" | "running" | "completed" | "failed"

export interface TraceEvent {
  id: string
  run_id: string
  sequence: number
  event_type: string
  agent_id: string | null
  agent_name: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface Run {
  id: string
  tree_id: string
  tree_name: string
  tree_version_id: string
  tree_version_number: number
  status: RunStatus
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  invocation_source: string
  output: { type: string; delivery_type: string; value: unknown; success: boolean; core_status: string | null } | null
  error_code: string | null
  error_message: string | null
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  created_at: string
}

export type DestinationType = "store_in_studio" | "api_response" | "webhook"

export interface ResultDestination {
  id: string
  tree_id: string
  name: string
  destination_type: DestinationType
  enabled: boolean
  configuration: Record<string, unknown>
  secret_id: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryResult {
  id: string
  run_id: string
  destination_id: string | null
  destination_name: string
  destination_type: DestinationType
  status: "pending" | "success" | "failed"
  attempted_at: string
  completed_at: string | null
  sanitized_error: string | null
}

export interface RunDetail extends Run {
  state: Record<string, unknown> | null
  trace: TraceEvent[]
  delivery_results: DeliveryResult[]
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    let code: string | undefined
    try {
      const payload = (await response.json()) as { detail?: string | Array<{ msg?: string }>; error?: { code?: string } }
      code = payload.error?.code
      if (typeof payload.detail === "string") message = payload.detail
      else if (Array.isArray(payload.detail)) {
        message = payload.detail.map((item) => item.msg).filter(Boolean).join(". ") || message
      }
    } catch {
      // Keep the status-based fallback; provider response bodies are never surfaced.
    }
    throw new ApiError(message, response.status, code)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  listSecrets: () => request<Secret[]>("/api/secrets"),
  createSecret: (payload: { name: string; secret_type: string; value: string }) =>
    request<Secret>("/api/secrets", { method: "POST", body: JSON.stringify(payload) }),
  deleteSecret: (id: string) => request<void>(`/api/secrets/${id}`, { method: "DELETE" }),

  listProviders: () => request<ProviderConnection[]>("/api/providers"),
  createProvider: (payload: ProviderPayload) =>
    request<ProviderConnection>("/api/providers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProvider: (id: string, payload: ProviderPayload) =>
    request<ProviderConnection>(`/api/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteProvider: (id: string) =>
    request<void>(`/api/providers/${id}`, { method: "DELETE" }),
  testProvider: (id: string) =>
    request<ProviderConnection>(`/api/providers/${id}/test`, { method: "POST" }),
  discoverModels: (id: string) =>
    request<DiscoveryResponse>(`/api/providers/${id}/discover-models`, { method: "POST" }),
  listModels: (id: string, includeUnusable = false) => request<ProviderModel[]>(`/api/providers/${id}/models${includeUnusable ? "?include_unusable=true" : ""}`),
  getDashboardSummary: () => request<DashboardSummary>("/api/dashboard/summary"),
  getSystemHealth: () => request<SystemHealth>("/api/system-health"),

  listTrees: () => request<TreeListItem[]>("/api/trees"),
  getTree: (id: string) => request<TreeDetail>(`/api/trees/${id}`),
  createTree: (payload: TreeDraftPayload) =>
    request<TreeDetail>("/api/trees", { method: "POST", body: JSON.stringify(payload) }),
  saveTreeDraft: (id: string, payload: TreeDraftPayload) =>
    request<TreeDetail>(`/api/trees/${id}/version`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTree: (id: string) => request<void>(`/api/trees/${id}`, { method: "DELETE" }),
  validateTree: (id: string, markReady = false) =>
    request<TreeValidation>(`/api/trees/${id}/validate?mark_ready=${markReady}`, { method: "POST" }),
  listTools: () => request<ToolConnection[]>("/api/tools"),
  getTool: (id: string) => request<ToolConnection>(`/api/tools/${id}`),
  createTool: (payload: ToolPayload) => request<ToolConnection>("/api/tools", {
    method: "POST", body: JSON.stringify(payload),
  }),
  updateTool: (id: string, payload: Partial<ToolPayload> & { selected_tools?: string[] }) =>
    request<ToolConnection>(`/api/tools/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTool: (id: string) => request<void>(`/api/tools/${id}`, { method: "DELETE" }),
  testTool: (id: string) => request<{ tool: ToolConnection; message: string }>(`/api/tools/${id}/test`, { method: "POST" }),
  discoverTool: (id: string) => request<{ tool: ToolConnection; tools: DiscoveredTool[] }>(`/api/tools/${id}/discover`, { method: "POST" }),
  executeTool: (id: string, payload: { arguments: Record<string, unknown>; tool_name?: string }) =>
    request<ToolExecution>(`/api/tools/${id}/test-execute`, { method: "POST", body: JSON.stringify(payload) }),
  getToolAssignments: (id: string) => request<{ assignments: ToolAssignmentInfo[] }>(`/api/tools/${id}/assignments`),
  updateToolAssignments: (id: string, agentIds: string[]) => request<{ assignments: ToolAssignmentInfo[] }>(`/api/tools/${id}/assignments`, {
    method: "PUT", body: JSON.stringify({ agent_ids: agentIds }),
  }),
  listCapabilities: (query = "") =>
    request<CapabilityCatalogItem[]>(`/api/capabilities${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  suggestCapabilities: (payload: CapabilitySuggestionPayload) =>
    request<{ suggestions: CapabilitySuggestion[] }>("/api/capabilities/suggest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testRun: (treeId: string, input: Record<string, unknown>) =>
    request<RunDetail>(`/api/trees/${treeId}/test-run`, {
      method: "POST",
      body: JSON.stringify({ input }),
    }),
  invokeTree: (treeId: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}) =>
    request<RunDetail>(`/api/runtime/trees/${treeId}/invoke`, {
      method: "POST",
      body: JSON.stringify({ input, metadata }),
    }),
  listDestinations: (treeId: string) => request<ResultDestination[]>(`/api/trees/${treeId}/destinations`),
  createDestination: (treeId: string, payload: Omit<ResultDestination, "id" | "tree_id" | "created_at" | "updated_at">) =>
    request<ResultDestination>(`/api/trees/${treeId}/destinations`, { method: "POST", body: JSON.stringify(payload) }),
  updateDestination: (treeId: string, destinationId: string, payload: Omit<ResultDestination, "id" | "tree_id" | "created_at" | "updated_at">) =>
    request<ResultDestination>(`/api/trees/${treeId}/destinations/${destinationId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteDestination: (treeId: string, destinationId: string) =>
    request<void>(`/api/trees/${treeId}/destinations/${destinationId}`, { method: "DELETE" }),
  testDestination: (treeId: string, destinationId: string) =>
    request<{ success: boolean; message: string }>(`/api/trees/${treeId}/destinations/${destinationId}/test`, { method: "POST" }),
  listRuns: (filters: { status?: RunStatus; treeId?: string } = {}) => {
    const query = new URLSearchParams()
    if (filters.status) query.set("status", filters.status)
    if (filters.treeId) query.set("tree_id", filters.treeId)
    return request<Run[]>(`/api/runs${query.size ? `?${query}` : ""}`)
  },
  listTreeRuns: (treeId: string) => request<Run[]>(`/api/trees/${treeId}/runs`),
  getRun: (runId: string) => request<RunDetail>(`/api/runs/${runId}`),
  getRunTrace: (runId: string) => request<TraceEvent[]>(`/api/runs/${runId}/trace`),
}
