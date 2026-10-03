export type ProviderType = "openai" | "gemini" | "groq" | "openrouter" | "cerebras" | "openai_compatible" | "ollama"
export type Permission = "manage_trees_agents" | "manage_secrets" | "manage_providers_models" | "manage_tools_mcp" | "view_executions" | "use_trees"
export type TreeAccessMode = "selected" | "all"
export interface StudioUser {
  id: string; username: string; is_admin: boolean; is_primary_admin: boolean; is_active: boolean; must_change_password: boolean
  permissions: Permission[]; allowed_tree_ids: string[]; tree_access_mode: TreeAccessMode; created_at: string; updated_at: string; last_login_at: string | null
}
export interface ApiToken { id: string; name: string; created_at: string; last_used_at?: string | null }
export interface SecurityEvent { id: string; event_type: string; actor_username: string | null; subject_user_id: string | null; created_at: string }
export interface SecurityEventPage { items: SecurityEvent[]; total: number; page: number; page_size: number; event_types: string[] }
export interface SecurityEventFilters { page?: number; page_size?: number; event_type?: string; actor?: string; search?: string; after?: string; before?: string }
export interface AccountInfo {
  user: StudioUser
  session_expires_at: string | null
  allowed_trees: Array<{ id: string; name: string }>
  active_token_count: number
}
export interface MyDashboard {
  onboarding?: GettingStartedState
  trees_count: number | null
  available_trees: Array<{ id: string; name: string; status: TreeStatus }>
  providers_count: number | null
  ready_models_count: number | null
  tools_count: number | null
  runs_count: number | null
  recent_runs: DashboardSummary["recent_runs"]
  secrets_count: number | null
}
export interface GettingStartedState {
  provider_ready: boolean | null
  trees: Array<{ id: string; name: string; template: string; ready: boolean }>
  runnable_tree_id: string | null
  successful_run_id: string | null
  has_successful_run: boolean | null
}
export type ProviderStatus = "not_configured" | "testing" | "connected" | "error"

export interface Secret {
  id: string
  name: string
  secret_type: string
  masked_value: string
  created_at: string
  updated_at: string
}

export interface ResourceDependency {
  type: "provider" | "tool" | "destination" | "agent"
  id: string
  name: string
  relation: string
  tree_id: string | null
  tree_name: string | null
  tree_version: number | null
  agent_id: string | null
  agent_name: string | null
  agent_type: string | null
  model_id: string | null
  capabilities: string[]
}

export interface ResourceDependencies {
  can_delete: boolean
  resource: { type: "secret" | "provider" | "tool"; id: string; name: string }
  dependencies: ResourceDependency[]
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
  qualification_status: "unknown" | "verifying" | "qualified" | "unavailable" | "transient_error"
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

export interface ProviderModelVerificationResponse {
  provider: ProviderConnection
  model: ProviderModel
}

export interface DashboardSummary {
  metrics: {
    trees: { total: number; ready: number; draft: number }
    runs: { total: number; today: number; running: number; completed: number; failed: number; success_rate: number | null }
    providers: { total: number; connected: number; usable_models: number }
    tools: { total: number; connected: number; enabled: number }
    users: number
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
  tool_type: "http_api" | "mcp" | "artifact"
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
  tool_type: "http_api" | "mcp" | "artifact"
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

export type TemplateKind = "builtin" | "user" | "learned"
export interface TemplateAgentDefinition {
  key: string; agent_type: AgentType; name: string; role: string; description: string; parent_key: string | null
  system_instruction: string | null; capabilities: string[]; settings: Record<string, unknown>
}
export interface TemplateToolRequirement {
  id: string; catalog_key: string; requirement: "required" | "recommended"; agent_ref: string | null; reason: string
}
export interface TemplateDefinition {
  schema_version: number; agents: TemplateAgentDefinition[]
  suggested_tools: Array<{ name: string; description: string; tool_type: string }>
  tool_requirements: TemplateToolRequirement[]
  trigger: TriggerDraft | null; output: OutputDraft | null; metadata: Record<string, unknown>
}
export interface TreeTemplate {
  id: string; name: string; description: string; category: string; template_type: TemplateKind
  definition: TemplateDefinition; agent_count: number; manager_count: number; specialist_count: number
  created_by: string | null; created_at: string | null; updated_at: string | null
}
export interface TemplateDraft { configuration: TreeDraftPayload; agent_ids: Record<string, string> }
export interface TemplateMetadataPayload { name: string; description: string; category: string }
export interface ToolPackage {
  id: string; name: string; description: string; category: string; version: string; icon: string
  status: "ready" | "experimental" | "coming_soon"; tool_type: ToolPayload["tool_type"] | null
  transport_type: ToolPayload["transport_type"]; config_fields: Array<{ key: string; kind: string; required: boolean; options: string[] }>
  required_secrets: string[]; operations: string[]; setup_instructions: string[]
}
export interface ToolPackageSetup {
  name?: string; description?: string; secret_id?: string | null; url?: string
  method?: string; auth_mode?: string; request_schema?: Record<string, unknown>
  test_arguments?: Record<string, unknown>; timeout?: number
}
export type TemplateRequirementState = "ready" | "available_to_add" | "needs_configuration" | "missing" | "coming_soon"
export interface TemplateToolRequirementStatus extends TemplateToolRequirement {
  agent_id: string | null; package_name: string | null; package_status: ToolPackage["status"] | null
  state: TemplateRequirementState; tool_id: string | null; action: "none" | "assign" | "add" | "configure"
  discovered_tools: Array<{ name: string; description: string; input_schema: Record<string, unknown>; selected: boolean }>
}
export interface TemplateAgentSetup {
  agent_ref: string | null; role: string; agent: AgentDraft; requirement_ids: string[]
}
export interface TemplateSetupReadiness {
  ready: boolean; ready_agent_count: number; total_agent_count: number
  agents_missing_models: string[]; agents_missing_instructions: string[]
  required_tools_ready: number; required_tools_total: number; required_tools_unresolved: string[]
  validation_issues: ValidationIssue[]
}
export interface TemplateSetupRead {
  tree: TreeDetail; definition: TemplateDefinition; agents: TemplateAgentSetup[]
  providers: Array<{ id: string; name: string; provider_type: ProviderType; models: ProviderModel[] }>
  tool_requirements: TemplateToolRequirementStatus[]; readiness: TemplateSetupReadiness; warnings: string[]
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

export type RunStatus = "pending" | "running" | "cancellation_requested" | "completed" | "failed" | "cancelled"

export type LiveRunStatus = "queued" | "running" | "cancellation_requested" | "completed" | "failed" | "cancelled"
export interface LiveRun {
  run_id: string; tree_id: string; tree_version_id: string; status: LiveRunStatus
  final_status: string | null; created_at: string; started_at: string | null; finished_at: string | null
  cancellation_requested: boolean; error: { code: string; message: string } | null
  artifact_count: number; latest_event_sequence: number; final_output: unknown | null
  usage?: Record<string, unknown> | null; metrics?: Record<string, unknown> | null
}
export interface LiveEvent {
  sequence: number; type: string; agent_id: string | null; agent_name: string | null
  payload: Record<string, unknown>; created_at: string
}
export interface LiveArtifact {
  artifact_id: string; type: string; name: string; path: string | null; operation: string
  media_type: string; size_bytes: number; sha256: string; producer_role: string
  producer_agent_id: string | null; is_final: boolean; body_available: boolean; created_at: string
  supersedes_artifact_id?: string | null
}
export interface LiveEventPage { events: LiveEvent[]; next_after: number; has_more: boolean }

export interface TraceEvent {
  core_sequence?: number | null
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
  final_status?: string | null
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

export interface WebhookIntegration {
  id: string; tree_id: string; name: string; enabled: boolean
  created_at: string; last_received_at: string | null
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

export interface TreeLive {
  tree_id: string
  tree_name: string
  runtime_status: "unavailable" | "starting" | "running" | "stopping" | "stopped" | "error"
  runtime_started_at: string | null
  active_count: number
  queued_count: number
  completed_count: number
  failed_count: number
  executions: Array<{ run: Run; current_agent: string | null; current_stage: string | null; current_tool: string | null }>
  recent_activity: TraceEvent[]
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") window.dispatchEvent(new Event("studio-auth-expired"))
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
  integrationConfig: () => request<{ public_origin: string | null }>("/api/auth/integration-config"),
  listWebhooks: (treeId: string) => request<WebhookIntegration[]>(`/api/trees/${treeId}/webhooks`),
  createWebhook: (treeId: string, name: string) => request<WebhookIntegration & { secret: string }>(`/api/trees/${treeId}/webhooks`, { method: "POST", body: JSON.stringify({ name }) }),
  updateWebhook: (treeId: string, id: string, enabled: boolean) => request<WebhookIntegration>(`/api/trees/${treeId}/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  rotateWebhook: (treeId: string, id: string) => request<WebhookIntegration & { secret: string }>(`/api/trees/${treeId}/webhooks/${id}/rotate`, { method: "POST" }),
  deleteWebhook: (treeId: string, id: string) => request<void>(`/api/trees/${treeId}/webhooks/${id}`, { method: "DELETE" }),
  login: (username: string, password: string) => request<StudioUser>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<StudioUser>("/api/auth/me"),
  account: () => request<AccountInfo>("/api/auth/account"),
  myDashboard: () => request<MyDashboard>("/api/dashboard/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  changePassword: (current_password: string, new_password: string) => request<StudioUser>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  listUsers: () => request<StudioUser[]>("/api/users"),
  listSecurityEvents: (filters: SecurityEventFilters = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value))
    return request<SecurityEventPage>(`/api/security-events${params.size ? `?${params}` : ""}`)
  },
  createUser: (payload: { username: string; password: string; is_admin: boolean; permissions: Permission[]; allowed_tree_ids: string[]; tree_access_mode: TreeAccessMode }) => request<StudioUser>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id: string, payload: { is_admin?: boolean; is_active?: boolean; permissions?: Permission[]; allowed_tree_ids?: string[]; tree_access_mode?: TreeAccessMode }) => request<StudioUser>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  resetUserPassword: (id: string, password: string) => request<void>(`/api/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: "DELETE" }),
  myTrees: () => request<TreeListItem[]>("/api/me/trees"),
  listTokens: () => request<ApiToken[]>("/api/auth/tokens"),
  createToken: (name: string) => request<ApiToken & { token: string }>("/api/auth/tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revokeToken: (id: string) => request<void>(`/api/auth/tokens/${id}`, { method: "DELETE" }),
  listSecrets: () => request<Secret[]>("/api/secrets"),
  createSecret: (payload: { name: string; secret_type: string; value: string }) =>
    request<Secret>("/api/secrets", { method: "POST", body: JSON.stringify(payload) }),
  deleteSecret: (id: string) => request<void>(`/api/secrets/${id}`, { method: "DELETE" }),
  getSecretDependencies: (id: string) => request<ResourceDependencies>(`/api/secrets/${id}/dependencies`),

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
  getProviderDependencies: (id: string) => request<ResourceDependencies>(`/api/providers/${id}/dependencies`),
  testProvider: (id: string) =>
    request<ProviderConnection>(`/api/providers/${id}/test`, { method: "POST" }),
  discoverModels: (id: string) =>
    request<DiscoveryResponse>(`/api/providers/${id}/discover-models`, { method: "POST" }),
  discoverModelCatalog: (id: string) =>
    request<DiscoveryResponse>(`/api/providers/${id}/discover-catalog`, { method: "POST" }),
  verifyProviderModel: (id: string, model_id: string) =>
    request<ProviderModelVerificationResponse>(`/api/providers/${id}/verify-model`, {
      method: "POST",
      body: JSON.stringify({ model_id }),
    }),
  listModels: (id: string, includeUnusable = false) => request<ProviderModel[]>(`/api/providers/${id}/models${includeUnusable ? "?include_unusable=true" : ""}`),
  getDashboardSummary: () => request<DashboardSummary>("/api/dashboard/summary"),
  getSystemHealth: () => request<SystemHealth>("/api/system-health"),

  listTrees: () => request<TreeListItem[]>("/api/trees"),
  getTree: (id: string) => request<TreeDetail>(`/api/trees/${id}`),
  previewTreeDraft: (payload: TreeDraftPayload, treeId?: string) =>
    request<TreeValidation>(`/api/trees/validate-draft${treeId ? `?tree_id=${encodeURIComponent(treeId)}` : ""}`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  createTree: (payload: TreeDraftPayload) =>
    request<TreeDetail>("/api/trees", { method: "POST", body: JSON.stringify(payload) }),
  saveTreeDraft: (id: string, payload: TreeDraftPayload) =>
    request<TreeDetail>(`/api/trees/${id}/version`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  replaceReadyTree: (id: string, payload: TreeDraftPayload) =>
    request<TreeDetail>(`/api/trees/${id}/configuration`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTree: (id: string) => request<void>(`/api/trees/${id}`, { method: "DELETE" }),
  listTemplates: () => request<TreeTemplate[]>("/api/templates"),
  getTemplate: (id: string) => request<TreeTemplate>(`/api/templates/${id}`),
  updateTemplate: (id: string, payload: Partial<TemplateMetadataPayload>) => request<TreeTemplate>(`/api/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTemplate: (id: string) => request<void>(`/api/templates/${id}`, { method: "DELETE" }),
  getTemplateDraft: (id: string) => request<TemplateDraft>(`/api/templates/${id}/draft`),
  previewTemplateDraft: (id: string, draft: TemplateDraft) => request<TreeValidation>(`/api/templates/${id}/validate-draft`, { method: "POST", body: JSON.stringify(draft) }),
  instantiateTemplate: (id: string, name?: string, draft?: TemplateDraft) => request<TreeDetail>(`/api/templates/${id}/instantiate`, { method: "POST", body: JSON.stringify({ ...(name ? { name } : {}), ...draft }) }),
  saveTreeAsTemplate: (id: string, payload: TemplateMetadataPayload) => request<TreeTemplate>(`/api/trees/${id}/save-as-template`, { method: "POST", body: JSON.stringify(payload) }),
  getTemplateSetup: (id: string) => request<TemplateSetupRead>(`/api/trees/${id}/template-setup`),
  createTemplateAgent: (id: string, payload: { agent_type: "manager" | "specialist"; parent_agent_id: string; name: string }) => request<TemplateSetupRead>(`/api/trees/${id}/template-setup/agents`, { method: "POST", body: JSON.stringify(payload) }),
  updateTemplateAgent: (id: string, agentId: string, payload: { name: string; description: string; capabilities: string[]; system_instruction: string | null; provider_connection_id: string | null; model_id: string | null }) => request<TemplateSetupRead>(`/api/trees/${id}/template-setup/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  updateTemplateAgentTools: (id: string, agentId: string, toolIds: string[]) => request<TemplateSetupRead>(`/api/trees/${id}/template-setup/agents/${agentId}/tools`, { method: "PUT", body: JSON.stringify({ tool_ids: toolIds }) }),
  bindTemplateAgentModel: (id: string, agentId: string, payload: { provider_connection_id: string | null; model_id: string | null }) => request<TemplateSetupRead>(`/api/trees/${id}/template-setup/agents/${agentId}/model`, { method: "PATCH", body: JSON.stringify(payload) }),
  applyTemplateDefault: (id: string, payload: { provider_connection_id: string | null; model_id: string | null }) => request<TemplateSetupRead>(`/api/trees/${id}/template-setup/apply-default`, { method: "POST", body: JSON.stringify(payload) }),
  resolveTemplateRequirement: (packageId: string, payload: { tree_id: string; requirement_id: string; agent_id?: string; setup?: ToolPackageSetup; selected_tools?: string[] }) => request<TemplateSetupRead>(`/api/tool-catalog/${packageId}/resolve-requirement`, { method: "POST", body: JSON.stringify(payload) }),
  resolveAllRequiredTemplateTools: (treeId: string) => request<TemplateSetupRead>("/api/tool-catalog/resolve-required", { method: "POST", body: JSON.stringify({ tree_id: treeId }) }),
  validateTree: (id: string, markReady = false) =>
    request<TreeValidation>(`/api/trees/${id}/validate?mark_ready=${markReady}`, { method: "POST" }),
  listTools: () => request<ToolConnection[]>("/api/tools"),
  listToolCatalog: () => request<ToolPackage[]>("/api/tool-catalog"),
  testToolPackage: (id: string, payload: ToolPackageSetup) => request<{ success: boolean; message: string }>(`/api/tool-catalog/${id}/test`, { method: "POST", body: JSON.stringify(payload) }),
  createToolFromPackage: (id: string, payload: ToolPackageSetup) => request<{ tool: ToolConnection; message: string }>(`/api/tool-catalog/${id}/create`, { method: "POST", body: JSON.stringify(payload) }),
  getTool: (id: string) => request<ToolConnection>(`/api/tools/${id}`),
  createTool: (payload: ToolPayload) => request<ToolConnection>("/api/tools", {
    method: "POST", body: JSON.stringify(payload),
  }),
  updateTool: (id: string, payload: Partial<ToolPayload> & { selected_tools?: string[] }) =>
    request<ToolConnection>(`/api/tools/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTool: (id: string) => request<void>(`/api/tools/${id}`, { method: "DELETE" }),
  getToolDependencies: (id: string) => request<ResourceDependencies>(`/api/tools/${id}/dependencies`),
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
  listRunPage: (query: URLSearchParams) => request<{ items: Run[]; total: number; page: number; page_size: number }>(`/api/runs?${query}`),
  getTreeVersion: (treeId: string, versionId: string) => request<TreeVersion>(`/api/trees/${treeId}/version?version_id=${encodeURIComponent(versionId)}`),
  listTreeRuns: (treeId: string) => request<Run[]>(`/api/trees/${treeId}/runs`),
  getTreeLive: (treeId: string) => request<TreeLive>(`/api/trees/${treeId}/live`),
  getRun: (runId: string) => request<RunDetail>(`/api/runs/${runId}`),
  getRunTrace: (runId: string) => request<TraceEvent[]>(`/api/runs/${runId}/trace`),
  submitLiveRun: (treeId: string, input: string) => request<{ run_id: string }>("/api/studio/runs", {
    method: "POST", body: JSON.stringify({ tree_id: treeId, input }),
  }),
  getLiveRun: (runId: string) => request<LiveRun>(`/api/studio/runs/${runId}`),
  getLiveEvents: (runId: string, after: number) => request<LiveEventPage>(`/api/studio/runs/${runId}/events?after=${after}&limit=500`),
  getLiveArtifacts: (runId: string) => request<{ artifacts: LiveArtifact[] }>(`/api/studio/runs/${runId}/artifacts`),
  getLiveResult: (runId: string) => request<{ final_output: unknown; final_status: string | null }>(`/api/studio/runs/${runId}/result`),
  cancelLiveRun: (runId: string) => request<{ status: LiveRunStatus }>(`/api/studio/runs/${runId}/cancel`, { method: "POST" }),
  fetchLiveArtifact: async (runId: string, artifactId: string) => {
    const response = await fetch(`/api/studio/runs/${runId}/artifacts/${artifactId}`, { credentials: "same-origin" })
    if (!response.ok) throw new ApiError(`Artifact unavailable (${response.status})`, response.status)
    return response.blob()
  },
}
