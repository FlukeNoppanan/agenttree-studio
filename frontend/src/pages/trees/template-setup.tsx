import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, CircleAlert, ExternalLink, Pencil, Plus, Wrench } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/auth"
import { CapabilitySelector } from "@/components/tree/capability-selector"
import { TemplateTreeCanvas } from "@/components/tree/template-tree-canvas"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, type AgentDraft, type Secret, type TemplateAgentSetup, type TemplateSetupRead, type TemplateToolRequirementStatus, type ToolConnection, type ToolPackageSetup } from "@/lib/api"

import { isUsableModel } from "@/lib/provider-models"

type NoticeState = { tone: "success" | "error"; message: string }

export function TemplateSetupPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { treeId = "" } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<TemplateSetupRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [defaultProviderId, setDefaultProviderId] = useState("")
  const [defaultModelId, setDefaultModelId] = useState("")
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentDraft | null>(null)
  const [agentToolIds, setAgentToolIds] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<ToolConnection[]>([])
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [resolvingAll, setResolvingAll] = useState(false)
  const [targetAgents, setTargetAgents] = useState<Record<string, string>>({})
  const [packages, setPackages] = useState<Array<{ id: string; name: string; description: string; config_fields: Array<{ key: string; kind: string; required: boolean; options: string[] }>; required_secrets: string[] }>>([])
  const [packageDialog, setPackageDialog] = useState<TemplateToolRequirementStatus | null>(null)
  const [packageSetup, setPackageSetup] = useState<ToolPackageSetup>({ method: "GET", auth_mode: "none", request_schema: { type: "object", properties: {} }, test_arguments: {}, timeout: 30 })
  const [selectedMcpTools, setSelectedMcpTools] = useState<string[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [secretError, setSecretError] = useState(false)
  const defaultInitialized = useRef(false)

  const load = useCallback(async () => {
    if (!treeId) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.getTemplateSetup(treeId)
      setData(result)
      if (!defaultInitialized.current) {
        const root = result.tree.version.agents.find(agent => agent.agent_type === "root")
        setDefaultProviderId(root?.provider_connection_id ?? "")
        setDefaultModelId(root?.model_id ?? "")
        defaultInitialized.current = true
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("templateSetupV1.loadError"))
    } finally { setLoading(false) }
  }, [treeId, t])

  useEffect(() => { void load() }, [load])

  const providerById = useMemo(() => new Map(data?.providers.map(provider => [provider.id, provider]) ?? []), [data])
  const packagesById = useMemo(() => new Map(packages.map(item => [item.id, item])), [packages])
  const requirementByAgentRef = useMemo(() => {
    const map = new Map<string, TemplateToolRequirementStatus[]>()
    for (const item of data?.tool_requirements ?? []) {
      const key = item.agent_ref ?? "shared"
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return map
  }, [data])

  function applyResponse(result: TemplateSetupRead) {
    setData(result)
    if (selectedAgentId) {
      setAgentDraft(result.agents.find(item => item.agent.id === selectedAgentId)?.agent ?? null)
      setAgentToolIds(result.tree.version.tool_assignments.filter(item => item.agent_config_id === selectedAgentId).map(item => item.tool_connection_id))
    }
  }

  function selectAgent(item: TemplateAgentSetup) {
    setSelectedAgentId(item.agent.id)
    setAgentDraft({ ...item.agent })
    setAgentToolIds(data?.tree.version.tool_assignments.filter(assignment => assignment.agent_config_id === item.agent.id).map(assignment => assignment.tool_connection_id) ?? [])
  }

  async function addAgent(agentType: "manager" | "specialist", parentId: string) {
    setAdding(true)
    try {
      const before = new Set(data?.agents.map(item => item.agent.id) ?? [])
      const result = await api.createTemplateAgent(treeId, {
        agent_type: agentType, parent_agent_id: parentId,
        name: agentType === "manager" ? t("templateWorkspaceV1.newManager") : t("templateWorkspaceV1.newSpecialist"),
      })
      applyResponse(result)
      void api.listTools().then(setAvailableTools).catch(() => undefined)
      const created = result.agents.find(item => !before.has(item.agent.id))
      if (created) {
        setSelectedAgentId(created.agent.id)
        setAgentDraft(created.agent)
        setAgentToolIds([])
      }
    } catch (cause) { setNotice({ tone: "error", message: cause instanceof Error ? cause.message : t("templateWorkspaceV1.addError") }) }
    finally { setAdding(false) }
  }

  async function saveAgentDetails() {
    if (!agentDraft || !agentDraft.name.trim()) return
    setSaving(agentDraft.id)
    try {
      let result = await api.updateTemplateAgent(treeId, agentDraft.id, {
        name: agentDraft.name, description: agentDraft.description,
        capabilities: agentDraft.capabilities, system_instruction: agentDraft.system_instruction,
        provider_connection_id: agentDraft.provider_connection_id, model_id: agentDraft.model_id,
      })
      const currentTools = result.tree.version.tool_assignments.filter(item => item.agent_config_id === agentDraft.id).map(item => item.tool_connection_id)
      if (currentTools.length !== agentToolIds.length || currentTools.some(id => !agentToolIds.includes(id))) {
        result = await api.updateTemplateAgentTools(treeId, agentDraft.id, agentToolIds)
      }
      applyResponse(result)
      setNotice({ tone: "success", message: t("templateWorkspaceV1.agentSaved") })
      setSelectedAgentId(null)
      setAgentDraft(null)
    } catch (cause) {
      await load()
      setNotice({ tone: "error", message: cause instanceof Error ? cause.message : t("templateWorkspaceV1.saveError") })
    } finally { setSaving(null) }
  }

  async function applyDefault() {
    if (!defaultProviderId || !defaultModelId) return
    setSaving("default")
    try {
      applyResponse(await api.applyTemplateDefault(treeId, {
        provider_connection_id: defaultProviderId, model_id: defaultModelId,
      }))
      setNotice({ tone: "success", message: t("templateSetupV1.defaultApplied") })
    } catch (cause) { setNotice({ tone: "error", message: cause instanceof Error ? cause.message : t("templateSetupV1.modelSaveError") }) }
    finally { setSaving(null) }
  }

  async function finishSetup() {
    setFinishing(true)
    try {
      const result = await api.validateTree(treeId, true)
      if (!result.valid) {
        await load()
        setNotice({ tone: "error", message: t("templateSetupV1.notReady") })
        return
      }
      setNotice({ tone: "success", message: t("templateSetupV1.completed") })
      navigate(`/trees/${treeId}`)
    } catch (cause) { setNotice({ tone: "error", message: cause instanceof Error ? cause.message : t("templateSetupV1.finishError") }) }
    finally { setFinishing(false) }
  }

  function scrollToIssue() {
    const first = data?.readiness.validation_issues[0]
    const item = data?.agents.find(candidate => candidate.agent.id === first?.agent_id)
    if (item) selectAgent(item)
    else document.getElementById("template-tool-requirements")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  async function loadSecretsIfAllowed(packageId: string) {
    setSecretError(false)
    const pkg = packagesById.get(packageId)
    const secretNeeded = packageId === "github-account-api" || packageId === "web-api-request" || packageId === "generic-mcp-http" || pkg?.config_fields.some(field => field.key === "secret_id")
    if (!secretNeeded || !can("manage_secrets")) return
    try { setSecrets(await api.listSecrets()) }
    catch { setSecretError(true) }
  }

  async function openRequirement(item: TemplateToolRequirementStatus) {
    if (!can("manage_tools_mcp")) return
    if (item.action === "assign") {
      await resolve(item, undefined)
      return
    }
    if (item.catalog_key === "generic-mcp-http" && item.tool_id) {
      if (item.discovered_tools?.length) {
        setSelectedMcpTools(item.discovered_tools.filter(tool => tool.selected).map(tool => tool.name))
        setPackageDialog(item)
      } else {
        await resolve(item, undefined)
      }
      return
    }
    if (item.action === "add" && item.state === "available_to_add") {
      await resolve(item, { request: {} })
      return
    }
    const packageInfo = packagesById.get(item.catalog_key)
    setPackageSetup({
      name: packageInfo?.name,
      description: packageInfo?.description,
      method: "GET", auth_mode: item.catalog_key === "github-account-api" ? "bearer" : "none",
      request_schema: { type: "object", properties: {} }, test_arguments: {}, timeout: 30,
    })
    setPackageDialog(item)
    await loadSecretsIfAllowed(item.catalog_key)
  }

  async function resolve(item: TemplateToolRequirementStatus, options?: { request?: ToolPackageSetup; selected_tools?: string[] }) {
    const targetAgent = item.agent_id ?? targetAgents[item.id]
    if (!item.agent_id && !targetAgent) {
      setNotice({ tone: "error", message: t("templateSetupV1.targetAgent") })
      return
    }
    setSaving(item.id)
    try {
      const result = await api.resolveTemplateRequirement(item.catalog_key, {
        tree_id: treeId, requirement_id: item.id, ...(targetAgent ? { agent_id: targetAgent } : {}),
        ...(options?.request ? { setup: options.request } : {}),
        ...(options?.selected_tools ? { selected_tools: options.selected_tools } : {}),
      })
      applyResponse(result)
      const updated = result.tool_requirements.find(candidate => candidate.id === item.id)
      void api.listTools().then(setAvailableTools).catch(() => undefined)
      if (updated?.catalog_key === "generic-mcp-http" && updated.state === "needs_configuration" && updated.tool_id) {
        setPackageDialog(updated)
        setSelectedMcpTools(updated.discovered_tools.filter(tool => tool.selected).map(tool => tool.name))
        setNotice(null)
      } else {
        setPackageDialog(null)
        setNotice({ tone: "success", message: t("templateSetupV1.modelSaved") })
      }
    } catch (cause) { setNotice({ tone: "error", message: cause instanceof Error ? cause.message : t("templateSetupV1.setupError") }) }
    finally { setSaving(null) }
  }

  async function resolveAllRequired() {
    setResolvingAll(true)
    try {
      applyResponse(await api.resolveAllRequiredTemplateTools(treeId))
      void api.listTools().then(setAvailableTools).catch(() => undefined)
    } catch (cause) { setNotice({ tone: "error", message: cause instanceof Error ? cause.message : t("templateSetupV1.setupError") }) }
    finally { setResolvingAll(false) }
  }

  function renderRequirement(item: TemplateToolRequirementStatus, assignedAgent?: string) {
    const packageInfo = packagesById.get(item.catalog_key)
    const busy = saving === item.id
    return <div key={item.id} className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{t(`templateSetupV1.packages.${item.catalog_key}.name`, { defaultValue: item.package_name ?? item.catalog_key })}</p><Badge variant={item.requirement === "required" ? "warning" : "secondary"}>{t(`templateSetupV1.${item.requirement}`)}</Badge><Badge variant={item.state === "ready" ? "success" : item.state === "coming_soon" ? "secondary" : "info"}>{t(`templateSetupV1.states.${item.state}`)}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">{item.reason || t(`templateSetupV1.packages.${item.catalog_key}.description`, { defaultValue: packageInfo?.description ?? "" })}</p>
          {item.state === "coming_soon" ? <p className="mt-2 text-xs text-muted-foreground">{t("templateSetupV1.comingSoonHelp")}</p> : null}
        </div>
        {item.state !== "ready" && item.state !== "coming_soon" && item.state !== "missing" && can("manage_tools_mcp") ? <Button size="sm" variant={item.requirement === "required" ? "default" : "outline"} disabled={busy} onClick={() => void openRequirement(item)}>{busy ? t("templateSetupV1.resolving") : item.action === "assign" ? <><Check className="size-4" />{t("templateSetupV1.assign")}</> : item.action === "add" ? <><Plus className="size-4" />{t("templateSetupV1.add")}</> : <><Wrench className="size-4" />{t("templateSetupV1.configure")}</>}</Button> : null}
        {item.state === "missing" ? <Badge variant="destructive">{t(`templateSetupV1.states.${item.state}`)}</Badge> : null}
      </div>
      {!assignedAgent && item.state !== "ready" && item.action !== "none" ? <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="space-y-1"><Label htmlFor={`target-${item.id}`} className="text-xs">{t("templateSetupV1.targetAgent")}</Label><Select id={`target-${item.id}`} value={targetAgents[item.id] ?? ""} onChange={event => setTargetAgents(current => ({ ...current, [item.id]: event.target.value }))}><option value="">{t("templateSetupV1.targetAgent")}</option>{(data?.agents ?? []).map(agent => <option key={agent.agent.id} value={agent.agent.id}>{agent.agent.name}</option>)}</Select></div></div> : null}
    </div>
  }

  // Package manifests are source controlled by Studio; fetching the list is
  // best effort and never creates a Tool or makes a remote request.
  useEffect(() => { void api.listToolCatalog().then(setPackages).catch(() => setPackages([])) }, [])
  useEffect(() => { void api.listTools().then(setAvailableTools).catch(() => setAvailableTools([])) }, [])

  if (loading && !data) return <div role="status" className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
  if (!data) return <div className="space-y-4"><Notice tone="error" message={error ?? t("templateSetupV1.loadError")} onDismiss={() => setError(null)} /><Button variant="outline" onClick={() => void load()}>{t("templateSetupV1.reload")}</Button></div>

  const providers = data.providers
  const defaultModels = (providerById.get(defaultProviderId)?.models ?? []).filter(isUsableModel)
  const requiredAddable = data.tool_requirements.some(item => item.requirement === "required" && item.state === "available_to_add" && item.package_status === "ready" && (item.action === "add" || item.action === "assign"))

  const selectedAgent = data.agents.find(item => item.agent.id === selectedAgentId)
  const selectedRequirements = data.tool_requirements.filter(item => item.agent_id === selectedAgentId)
  const selectedProviderModels = (providerById.get(agentDraft?.provider_connection_id ?? "")?.models ?? []).filter(isUsableModel)
  const selectIssue = (agentId: string | null) => {
    const item = data.agents.find(candidate => candidate.agent.id === agentId)
    if (item) selectAgent(item)
    else document.getElementById("template-tool-requirements")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  const shared = requirementByAgentRef.get("shared") ?? []
  const selectingMcpTools = packageDialog?.catalog_key === "generic-mcp-http" && Boolean(packageDialog.tool_id)
  const packageSetupDisabled = Boolean(saving)
    || (selectingMcpTools && selectedMcpTools.length === 0)
    || (!selectingMcpTools && Boolean((packageSetup.auth_mode !== "none" || packageDialog?.catalog_key === "github-account-api") && !packageSetup.secret_id))
    || (!selectingMcpTools && Boolean(
      packagesById.get(packageDialog?.catalog_key ?? "")?.config_fields.some(field => field.key === "url")
      && !packageSetup.url?.trim(),
    ))

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => navigate("/templates")}><ArrowLeft className="size-4" />{t("templateSetupV1.backToTemplates")}</Button><Button variant="outline" onClick={() => navigate(`/trees/${treeId}/build`)}>Visual Builder</Button><Button variant="outline" onClick={() => navigate(`/trees/${treeId}/edit`)}><ExternalLink className="size-4" />{t("templateSetupV1.advancedEdit")}</Button></div>
    <PageHeader title={t("templateSetupV1.title")} description={`${data.tree.name} · ${t("templateSetupV1.description")}`} />
    {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
    {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}

    <Card><CardHeader><CardTitle>{t("templateSetupV1.aiConfig")}</CardTitle><CardDescription>{t("templateSetupV1.aiConfigHelp")}</CardDescription></CardHeader><CardContent className="space-y-4">
      {!providers.length ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4"><p className="text-sm text-muted-foreground">{t("templateSetupV1.noProviders")}</p>{can("manage_providers_models") ? <Button variant="outline" asChild><Link to="/providers">{t("templateSetupV1.connectProviders")}<ArrowRight className="size-4" /></Link></Button> : null}</div> : <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5"><Label htmlFor="default-provider">{t("templateSetupV1.defaultProvider")}</Label><Select id="default-provider" value={defaultProviderId} onChange={event => { setDefaultProviderId(event.target.value); setDefaultModelId("") }}><option value="">{t("templateSetupV1.selectProvider")}</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</Select></div>
        <div className="space-y-1.5"><Label htmlFor="default-model">{t("templateSetupV1.defaultModel")}</Label><Select id="default-model" value={defaultModelId} disabled={!defaultProviderId || defaultModels.length === 0} onChange={event => setDefaultModelId(event.target.value)}><option value="">{t("templateSetupV1.selectModel")}</option>{defaultModelId && !defaultModels.some(model => model.model_id === defaultModelId) ? <option value={defaultModelId} disabled>{defaultModelId} · {t("trees.modelUnavailable")}</option> : null}{defaultModels.map(model => <option key={model.id} value={model.model_id}>{model.display_name || model.model_id}</option>)}</Select></div>
        <Button disabled={!defaultProviderId || !defaultModelId || saving === "default"} onClick={() => void applyDefault()}>{saving === "default" ? t("templateSetupV1.applying") : t("templateSetupV1.applyAll")}</Button>
      </div>}
      {defaultProviderId && !defaultModels.length ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{t("templateSetupV1.noModels")}</p>{can("manage_providers_models") ? <Button variant="ghost" size="sm" asChild><Link to="/providers">{t("templateSetupV1.connectProviders")}<ArrowRight className="size-4" /></Link></Button> : null}</div> : null}
    </CardContent></Card>

    <section className="space-y-3"><div><h2 className="text-lg font-semibold">{t("templateWorkspaceV1.visualTree")}</h2><p className="text-sm text-muted-foreground">{t("templateWorkspaceV1.selectNode")}</p></div><TemplateTreeCanvas data={data} selectedId={selectedAgentId} onSelect={selectAgent} onAdd={(type, parentId) => void addAgent(type, parentId)} adding={adding} /></section>

    {shared.length ? <section id="template-tool-requirements" className="space-y-3"><div><h2 className="text-lg font-semibold">{t("templateSetupV1.shared")}</h2><p className="text-sm text-muted-foreground">{t("templateSetupV1.requirements")}</p></div>{shared.map(item => renderRequirement(item))}</section> : null}
    {data.warnings.length ? <section className="rounded-xl border border-warning/25 bg-warning/5 p-4"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CircleAlert className="size-4" />{t("templateSetupV1.warnings")}</h2><ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">{data.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></section> : null}
    {!can("manage_tools_mcp") && data.tool_requirements.some(item => item.state !== "ready") ? <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">{t("templateSetupV1.noToolPermission")}</p> : null}

    <Card><CardHeader><CardTitle>{t("templateSetupV1.readiness")}</CardTitle><CardDescription>{data.readiness.ready ? t("templateSetupV1.completed") : t("templateSetupV1.notReady")}</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><Metric label={t("templateSetupV1.agentsReady")} value={`${data.readiness.ready_agent_count}/${data.readiness.total_agent_count}`} /><Metric label={t("templateSetupV1.toolsReady")} value={`${data.readiness.required_tools_ready}/${data.readiness.required_tools_total}`} /></div>
      {data.readiness.agents_missing_models.length ? <p className="text-sm text-muted-foreground">{t("templateSetupV1.missingModels")}: {data.readiness.agents_missing_models.join(", ")}</p> : null}
      {data.readiness.agents_missing_instructions.length ? <p className="text-sm text-muted-foreground">{t("templateSetupV1.missingInstructions")}: {data.readiness.agents_missing_instructions.join(", ")}</p> : null}
      {data.readiness.required_tools_unresolved.length ? <p className="text-sm text-muted-foreground">{t("templateSetupV1.unresolvedTools")}: {data.readiness.required_tools_unresolved.join(", ")}</p> : null}
      {data.readiness.validation_issues.length ? <div><h3 className="mb-2 text-sm font-semibold">{t("templateSetupV1.validationIssues")}</h3><ul className="space-y-1 text-sm text-destructive">{data.readiness.validation_issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`}><button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => selectIssue(issue.agent_id)}>{issue.message}</button></li>)}</ul><Button variant="ghost" className="px-0" onClick={scrollToIssue}>{t("templateSetupV1.resolveIssue")}</Button></div> : null}
      {requiredAddable && can("manage_tools_mcp") ? <Button variant="outline" disabled={resolvingAll} onClick={() => void resolveAllRequired()}><Plus className="size-4" />{resolvingAll ? t("templateSetupV1.resolving") : t("templateSetupV1.addAllRequired")}</Button> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><Button variant="outline" onClick={() => navigate(`/trees/${treeId}/edit`)}><Pencil className="size-4" />{t("templateSetupV1.advancedEdit")}</Button><Button disabled={!data.readiness.ready || finishing} onClick={() => void finishSetup()}>{finishing ? t("templateSetupV1.finishing") : t("templateSetupV1.finish")}<Check className="size-4" /></Button></div>
    </CardContent></Card>

    <Dialog open={Boolean(selectedAgentId)} onOpenChange={open => { if (!open) { setSelectedAgentId(null); setAgentDraft(null) } }}>
      <DialogContent className="fixed inset-y-0 right-0 left-auto top-0 h-screen max-h-screen w-full max-w-xl translate-x-0 translate-y-0 rounded-none sm:rounded-l-2xl" aria-describedby="template-agent-help">
        {agentDraft && selectedAgent ? <>
          <DialogHeader><DialogTitle>{t("templateWorkspaceV1.agentSettings")}: {selectedAgent.agent.name}</DialogTitle><DialogDescription id="template-agent-help">{t(`templatesV3.roles.${agentDraft.agent_type}`)} · {t("templateWorkspaceV1.settingsHelp")}</DialogDescription></DialogHeader>
          <div className="space-y-5 pb-20">
            <div className="space-y-3"><div className="space-y-1.5"><Label htmlFor="setup-agent-name">{t("agents.name")}</Label><Input id="setup-agent-name" value={agentDraft.name} onChange={event => setAgentDraft({ ...agentDraft, name: event.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="setup-agent-description">{t("agents.description")}</Label><Textarea id="setup-agent-description" value={agentDraft.description} onChange={event => setAgentDraft({ ...agentDraft, description: event.target.value })} /></div></div>
            <section className="space-y-3"><h3 className="font-semibold">{t("templateSetupV1.aiConfig")}</h3><div className="space-y-1.5"><Label htmlFor="setup-agent-provider">{t("templateSetupV1.agentProvider")}</Label><Select id="setup-agent-provider" value={agentDraft.provider_connection_id ?? ""} onChange={event => setAgentDraft({ ...agentDraft, provider_connection_id: event.target.value || null, model_id: null })}><option value="">{t("templateSetupV1.selectProvider")}</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</Select></div><div className="space-y-1.5"><Label htmlFor="setup-agent-model">{t("templateSetupV1.agentModel")}</Label><Select id="setup-agent-model" value={agentDraft.model_id ?? ""} disabled={!agentDraft.provider_connection_id || !selectedProviderModels.length} onChange={event => setAgentDraft({ ...agentDraft, model_id: event.target.value || null })}><option value="">{t("templateSetupV1.selectModel")}</option>{agentDraft.model_id && !selectedProviderModels.some(model => model.model_id === agentDraft.model_id) ? <option value={agentDraft.model_id} disabled>{agentDraft.model_id} · {t("trees.modelUnavailable")}</option> : null}{selectedProviderModels.map(model => <option key={model.id} value={model.model_id}>{model.display_name || model.model_id}</option>)}</Select></div></section>
            <section className="space-y-2"><h3 className="font-semibold">{t("agents.capabilities")}</h3><div className="flex flex-wrap gap-1">{agentDraft.capabilities.map(capability => <Badge key={capability} variant="secondary">{capability}</Badge>)}</div><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{t("templateWorkspaceV1.editCapabilities")}</summary><div className="mt-3"><CapabilitySelector value={agentDraft.capabilities} onChange={capabilities => setAgentDraft(current => current ? { ...current, capabilities } : current)} agentType={agentDraft.agent_type} name={agentDraft.name} description={agentDraft.description} systemInstruction={agentDraft.system_instruction ?? ""} providerConnectionId={agentDraft.provider_connection_id} modelId={agentDraft.model_id} /></div></details></section>
            <section className="space-y-2"><h3 className="font-semibold">{t("templateSetupV1.requirements")}</h3>{selectedRequirements.map(item => renderRequirement(item, agentDraft.id))}{availableTools.filter(tool => tool.status === "connected" && tool.enabled).map(tool => <label key={tool.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"><input type="checkbox" checked={agentToolIds.includes(tool.id)} onChange={event => setAgentToolIds(current => event.target.checked ? [...current, tool.id] : current.filter(id => id !== tool.id))} />{tool.name}</label>)}<p className="text-xs text-muted-foreground">{t("templateWorkspaceV1.toolsHelp")}</p><Button variant="outline" size="sm" asChild><Link to="/tools">{t("templateWorkspaceV1.manageTools")}</Link></Button></section>
            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{t("templateWorkspaceV1.advancedInstructions")}</summary><div className="mt-3 space-y-1.5"><Label htmlFor="setup-agent-instruction">{t("agents.systemInstruction")}</Label><Textarea id="setup-agent-instruction" className="min-h-32" value={agentDraft.system_instruction ?? ""} onChange={event => setAgentDraft({ ...agentDraft, system_instruction: event.target.value })} /></div></details>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card py-3"><Button variant="outline" onClick={() => { setSelectedAgentId(null); setAgentDraft(null) }}>{t("common.cancel")}</Button><Button disabled={!agentDraft.name.trim() || Boolean(saving)} onClick={() => void saveAgentDetails()}>{saving === agentDraft.id ? t("templateSetupV1.saving") : t("common.save")}</Button></div>
        </> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(packageDialog)} onOpenChange={open => { if (!open) setPackageDialog(null) }}><DialogContent><DialogHeader><DialogTitle>{t("templateSetupV1.setupPackage", { name: packageDialog ? t(`templateSetupV1.packages.${packageDialog.catalog_key}.name`, { defaultValue: packageDialog.package_name ?? packageDialog.catalog_key }) : "" })}</DialogTitle><DialogDescription>{packageDialog ? t(`templateSetupV1.packages.${packageDialog.catalog_key}.description`, { defaultValue: packageDialog.reason }) : ""}</DialogDescription></DialogHeader>
      {selectingMcpTools ? <div className="space-y-3"><p className="text-sm text-muted-foreground">{packageDialog?.discovered_tools?.length ? t("templateSetupV1.selectMcpTools") : t("templateSetupV1.noMcpToolsFound")}</p>{packageDialog?.discovered_tools.map(tool => <label key={tool.name} className="flex items-start gap-3 rounded-lg border border-border p-3"><input type="checkbox" checked={selectedMcpTools.includes(tool.name)} onChange={event => setSelectedMcpTools(current => event.target.checked ? [...new Set([...current, tool.name])] : current.filter(name => name !== tool.name))} /><span><span className="block text-sm font-medium">{tool.name}</span><span className="text-xs text-muted-foreground">{tool.description}</span></span></label>)}</div> : <div className="space-y-4">
        {packagesById.get(packageDialog?.catalog_key ?? "")?.config_fields.some(field => field.key === "url") ? <div className="space-y-2"><Label htmlFor="tool-url">{t("templateSetupV1.url")}</Label><Input id="tool-url" value={packageSetup.url ?? ""} onChange={event => setPackageSetup(current => ({ ...current, url: event.target.value }))} placeholder="https://" /></div> : null}
        {packageDialog?.catalog_key === "web-api-request" ? <div className="space-y-2"><Label htmlFor="tool-method">{t("templateSetupV1.method")}</Label><Select id="tool-method" value={packageSetup.method ?? "GET"} onChange={event => setPackageSetup(current => ({ ...current, method: event.target.value }))}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map(method => <option key={method}>{method}</option>)}</Select></div> : null}
        {packageDialog?.catalog_key === "web-api-request" || packageDialog?.catalog_key === "generic-mcp-http" ? <div className="space-y-2"><Label htmlFor="tool-auth">{t("templateSetupV1.auth")}</Label><Select id="tool-auth" value={packageSetup.auth_mode ?? "none"} onChange={event => setPackageSetup(current => ({ ...current, auth_mode: event.target.value, secret_id: event.target.value === "none" ? null : current.secret_id }))}><option value="none">{t("templateSetupV1.none")}</option><option value="bearer">{t("templateSetupV1.bearer")}</option>{packageDialog.catalog_key === "web-api-request" ? <option value="api_key">{t("templateSetupV1.api_key")}</option> : null}</Select></div> : null}
        {(packageDialog?.catalog_key === "github-account-api" || packageSetup.auth_mode !== "none") ? <div className="space-y-2"><Label htmlFor="tool-secret">{t("templateSetupV1.secret")}</Label><Select id="tool-secret" value={packageSetup.secret_id ?? ""} onChange={event => setPackageSetup(current => ({ ...current, secret_id: event.target.value || null }))}><option value="">{t("templateSetupV1.selectSecret")}</option>{secrets.map(secret => <option key={secret.id} value={secret.id}>{secret.name}</option>)}</Select><p className="text-xs text-muted-foreground">{t("templateSetupV1.credentialsHelp")}</p>{secretError || !can("manage_secrets") ? <Button variant="ghost" asChild className="h-auto p-0"><Link to="/secrets">{t("toolCatalogV1.manageSecrets")}</Link></Button> : null}</div> : null}
        <div className="space-y-2"><Label htmlFor="tool-name">{t("templateSetupV1.name")}</Label><Input id="tool-name" value={packageSetup.name ?? ""} onChange={event => setPackageSetup(current => ({ ...current, name: event.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="tool-description">{t("templateSetupV1.descriptionField")}</Label><Textarea id="tool-description" value={packageSetup.description ?? ""} onChange={event => setPackageSetup(current => ({ ...current, description: event.target.value }))} /></div>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setPackageDialog(null)}>{t("common.cancel")}</Button><Button disabled={packageSetupDisabled} onClick={() => packageDialog && void resolve(packageDialog, selectingMcpTools ? { selected_tools: selectedMcpTools } : { request: packageSetup })}>{saving ? t("templateSetupV1.testing") : selectingMcpTools ? t("templateSetupV1.assign") : t("templateSetupV1.testAndAdd")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>
}
