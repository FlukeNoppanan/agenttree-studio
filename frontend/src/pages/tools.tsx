import { Activity, ArrowRight, Database, Folder, Globe, Github, Plug, Plus, Wrench } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/empty-state"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { ResourceDependencyDialog } from "@/components/resource-dependency-dialog"
import { McpDiscoveryDialog } from "@/components/tools/mcp-discovery-dialog"
import { ToolCard, type ToolCardFeedback, type ToolCardOperation } from "@/components/tools/tool-card"
import { ToolForm } from "@/components/tools/tool-form"
import { ToolTestDialog } from "@/components/tools/tool-test-dialog"
import type { EligibleSpecialist } from "@/components/tools/tool-assignment-selector"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type DiscoveredTool, type Secret, type ToolConnection, type ToolPackage, type ToolPackageSetup } from "@/lib/api"

export function ToolsPage() {
  const { t } = useTranslation()
  const [tools, setTools] = useState<ToolConnection[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [specialists, setSpecialists] = useState<EligibleSpecialist[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ToolConnection | null>(null)
  const [testing, setTesting] = useState<ToolConnection | null>(null)
  const [discovery, setDiscovery] = useState<{ connectionName: string; tools: DiscoveredTool[] } | null>(null)
  const [feedback, setFeedback] = useState<Record<string, ToolCardFeedback>>({})
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [deletingTool, setDeletingTool] = useState<ToolConnection | null>(null)
  const [packages, setPackages] = useState<ToolPackage[]>([])
  const [tab, setTab] = useState<"catalog" | "tools">(() => new URLSearchParams(window.location.search).has("focus") ? "tools" : "catalog")
  const [selectedPackage, setSelectedPackage] = useState<ToolPackage | null>(null)
  const [setup, setSetup] = useState<ToolPackageSetup>({ method: "GET", auth_mode: "none", timeout: 30, request_schema: { type: "object", properties: {} }, test_arguments: {} })
  const [packageTesting, setPackageTesting] = useState(false)
  const [packageTested, setPackageTested] = useState(false)
  const [packageFeedback, setPackageFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [schemaText, setSchemaText] = useState('{\n  "type": "object",\n  "properties": {}\n}')
  const [argumentsText, setArgumentsText] = useState("{}")
  const [schemaValid, setSchemaValid] = useState(true)
  const [argumentsValid, setArgumentsValid] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [toolResult, secretResult, treeResult, packageResult] = await Promise.allSettled([api.listTools(), api.listSecrets(), api.listTrees(), api.listToolCatalog()])
      if (toolResult.status === "rejected") throw toolResult.reason
      setTools(toolResult.value)
      setSecrets(secretResult.status === "fulfilled" ? secretResult.value : [])
      setPackages(packageResult.status === "fulfilled" ? packageResult.value : [])
      const detailResults = treeResult.status === "fulfilled"
        ? await Promise.allSettled(treeResult.value.map((tree) => api.getTree(tree.id)))
        : []
      const details = detailResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      setSpecialists(details.flatMap((tree) => tree.version.agents
        .map((agent) => ({
          id: agent.id, name: `${agent.name} (${agent.agent_type})`, treeName: tree.name,
        }))))
      const supplementalError = secretResult.status === "rejected" || treeResult.status === "rejected" || packageResult.status === "rejected" || detailResults.some((result) => result.status === "rejected")
      if (supplementalError) setNotice({ tone: "error", message: "Tools loaded, but some Secret or Agent assignment options are temporarily unavailable." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load Tools" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  const focusedToolId = new URLSearchParams(window.location.search).get("focus")
  useEffect(() => {
    if (focusedToolId && tools.some((item) => item.id === focusedToolId)) {
      document.getElementById(`tool-${focusedToolId}`)?.scrollIntoView?.({ block: "center" })
    }
  }, [focusedToolId, tools])

  function openCreate() { setEditing(null); setFormOpen(true) }
  function openPackage(item: ToolPackage) {
    setSelectedPackage(item)
    setPackageTested(false)
    setPackageFeedback(null)
    setSchemaText('{\n  "type": "object",\n  "properties": {}\n}')
    setArgumentsText("{}")
    setSchemaValid(true); setArgumentsValid(true)
    setSetup({ name: item.name, description: item.description, method: "GET", auth_mode: item.id === "github-account-api" ? "bearer" : "none", timeout: 30, request_schema: { type: "object", properties: {} }, test_arguments: {} })
  }
  async function testPackage() {
    if (!selectedPackage) return
    setPackageTesting(true); setPackageTested(false); setPackageFeedback(null)
    try {
      const result = await api.testToolPackage(selectedPackage.id, setup)
      setPackageTested(result.success)
      setPackageFeedback({ tone: result.success ? "success" : "error", message: result.message })
    } catch (error) {
      setPackageTested(false)
      setPackageFeedback({ tone: "error", message: error instanceof Error ? error.message : t("toolCatalog.testFailed") })
    } finally { setPackageTesting(false) }
  }
  async function addPackageTool() {
    if (!selectedPackage || !packageTested) return
    setBusy(`catalog:${selectedPackage.id}`)
    try {
      const result = await api.createToolFromPackage(selectedPackage.id, setup)
      setTools(items => [result.tool, ...items.filter(item => item.id !== result.tool.id)])
      setSelectedPackage(null); setPackageTested(false); setTab("tools")
      setNotice({ tone: "success", message: t("toolCatalog.added", { name: result.tool.name }) })
    } catch (error) { setPackageFeedback({ tone: "error", message: error instanceof Error ? error.message : t("toolCatalog.addFailed") }) }
    finally { setBusy(null) }
  }
  function updatePackageJson(which: "schema" | "arguments", value: string) {
    setPackageTested(false); setPackageFeedback(null)
    if (which === "schema") setSchemaText(value); else setArgumentsText(value)
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required")
      if (which === "schema") {
        setSchemaValid(true)
        setSetup(current => ({ ...current, request_schema: parsed as Record<string, unknown> }))
      } else {
        setArgumentsValid(true)
        setSetup(current => ({ ...current, test_arguments: parsed as Record<string, unknown> }))
      }
    } catch {
      if (which === "schema") setSchemaValid(false); else setArgumentsValid(false)
    }
  }
  function openEdit(tool: ToolConnection) { setEditing(tool); setFormOpen(true) }
  function replaceTool(updated: ToolConnection) { setTools((current) => current.map((item) => item.id === updated.id ? updated : item)) }
  function operationFor(toolId: string): ToolCardOperation {
    if (!busy?.endsWith(`:${toolId}`)) return null
    return busy.split(":", 1)[0] as ToolCardOperation
  }

  async function testConnection(tool: ToolConnection) {
    setBusy(`test:${tool.id}`)
    setFeedback((current) => { const next = { ...current }; delete next[tool.id]; return next })
    try {
      const result = await api.testTool(tool.id)
      replaceTool(result.tool)
      const succeeded = result.tool.status === "connected"
      const message = succeeded
        ? t(tool.tool_type === "mcp" ? "toolUx.mcpTestSuccess" : "toolUx.httpTestSuccess", { name: tool.name })
        : `${t(tool.tool_type === "mcp" ? "toolUx.mcpTestFailure" : "toolUx.httpTestFailure")}: ${result.message}`
      setFeedback((current) => ({ ...current, [tool.id]: { tone: succeeded ? "success" : "error", message } }))
      setNotice({ tone: succeeded ? "success" : "error", message })
    } catch (error) {
      const reason = error instanceof Error ? error.message : t("toolUx.connectionFailureReason")
      const message = `${t(tool.tool_type === "mcp" ? "toolUx.mcpTestFailure" : "toolUx.httpTestFailure")}: ${reason}`
      try { replaceTool(await api.getTool(tool.id)) } catch { /* Keep the last visible state when refresh is unavailable. */ }
      setFeedback((current) => ({ ...current, [tool.id]: { tone: "error", message } }))
      setNotice({ tone: "error", message })
    } finally { setBusy(null) }
  }

  async function discover(tool: ToolConnection) {
    setBusy(`discover:${tool.id}`)
    setFeedback((current) => { const next = { ...current }; delete next[tool.id]; return next })
    try {
      const result = await api.discoverTool(tool.id)
      replaceTool(result.tool)
      setDiscovery({ connectionName: tool.name, tools: result.tools })
    } catch (error) {
      const reason = error instanceof Error ? error.message : t("toolUx.discoveryFailureReason")
      const message = `${t("toolUx.discoveryFailure")}: ${reason}`
      try { replaceTool(await api.getTool(tool.id)) } catch { /* Keep the last visible state when refresh is unavailable. */ }
      setFeedback((current) => ({ ...current, [tool.id]: { tone: "error", message } }))
      setNotice({ tone: "error", message })
    } finally { setBusy(null) }
  }

  const packageIcon = (id: string) => id.includes("github") ? Github : id.includes("database") ? Database : id.includes("filesystem") ? Folder : id.includes("monitoring") ? Activity : id.includes("mcp") ? Plug : Globe
  const packageName = (item: ToolPackage) => t(`toolCatalog.packages.${item.id}.name`, { defaultValue: item.name })
  const packageDescription = (item: ToolPackage) => t(`toolCatalog.packages.${item.id}.description`, { defaultValue: item.description })
  const operationLabel = (label: string) => t(`toolCatalog.operations.${label === "HTTP request" ? "httpRequest" : label === "Discover MCP tools" ? "discoverMcp" : label === "Execute selected MCP tools" ? "executeMcp" : label === "Read authenticated account" ? "githubAccount" : "other"}`, { defaultValue: label })
  const canTestPackage = Boolean(selectedPackage && (selectedPackage.id === "github-account-api" ? setup.secret_id : selectedPackage.id === "generic-mcp-http" ? setup.url && (setup.auth_mode !== "bearer" || setup.secret_id) : setup.url && (setup.auth_mode === "none" || setup.secret_id)))
  return <div className="space-y-7">
    <PageHeader title={t("tools.title")} description={t("tools.description")} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setTab("catalog")}><Plus className="size-4" />{t("toolCatalog.addFromCatalog")}</Button><Button onClick={openCreate}><Wrench className="size-4" />{t("toolCatalog.createCustom")}</Button></div>} />
    {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
    <div className="studio-tabs"><button aria-pressed={tab === "catalog"} onClick={() => setTab("catalog")} className="rounded-lg px-4 py-2.5 text-sm font-medium aria-pressed:text-primary">{t("toolCatalog.catalogTab")}</button><button aria-pressed={tab === "tools"} onClick={() => setTab("tools")} className="rounded-lg px-4 py-2.5 text-sm font-medium aria-pressed:text-primary">{t("toolCatalog.myToolsTab")} <span className="ml-1 text-xs text-muted-foreground">{tools.length}</span></button></div>
    {loading ? <div className="resource-list"><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : tab === "catalog" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{packages.map(item => {
      const Icon = packageIcon(item.id)
      return <Card key={item.id} className="flex min-w-0 flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><Badge variant={item.status === "ready" ? "success" : item.status === "experimental" ? "warning" : "secondary"}>{t(`toolCatalog.status.${item.status}`)}</Badge></div><CardTitle className="mt-3">{packageName(item)}</CardTitle><CardDescription>{packageDescription(item)}</CardDescription></CardHeader><CardContent className="mt-auto space-y-4"><div className="flex flex-wrap gap-1.5">{item.operations.map(operation => <Badge variant="secondary" key={operation}>{operationLabel(operation)}</Badge>)}</div><Button className="w-full" variant={item.status === "coming_soon" ? "outline" : "default"} disabled={item.status === "coming_soon"} onClick={() => openPackage(item)}>{item.status === "coming_soon" ? t("toolCatalog.comingSoon") : t("toolCatalog.configure")}<ArrowRight className="size-4" /></Button></CardContent></Card>
    })}{!packages.length ? <p className="text-sm text-muted-foreground">{t("toolCatalog.catalogUnavailable")}</p> : null}</div> : tools.length ? <div className="resource-list">{tools.map((tool) => <div key={tool.id} id={`tool-${tool.id}`} className={focusedToolId === tool.id ? "rounded-2xl ring-2 ring-primary" : undefined}><ToolCard tool={tool} operation={operationFor(tool.id)} feedback={feedback[tool.id]} onTest={() => void testConnection(tool)} onDiscover={() => void discover(tool)} onExecute={() => setTesting(tool)} onEdit={() => openEdit(tool)} onDelete={() => setDeletingTool(tool)} /></div>)}</div> : <EmptyState icon={Wrench} title={t("tools.empty")} description={t("tools.emptyHelp")} />}
    <ToolForm open={formOpen} onOpenChange={setFormOpen} tool={editing} secrets={secrets} specialists={specialists} onComplete={() => { void load(); setNotice({ tone: "success", message: editing ? t("toolCatalog.updated") : t("toolCatalog.created") }) }} />
    <ToolTestDialog tool={testing} open={Boolean(testing)} onOpenChange={(open) => { if (!open) setTesting(null) }} />
    <McpDiscoveryDialog connectionName={discovery?.connectionName ?? ""} tools={discovery?.tools ?? []} open={Boolean(discovery)} onOpenChange={(open) => { if (!open) setDiscovery(null) }} />
    <ResourceDependencyDialog resource={deletingTool && { id: deletingTool.id, name: deletingTool.name, type: "tool" }} inspect={api.getToolDependencies} remove={api.deleteTool} onClose={() => setDeletingTool(null)} onDeleted={async () => { await load(); setNotice({ tone: "success", message: t("resourceDeletion.deleted", { type: t("resourceDeletion.types.tool") }) }) }} />
    <Dialog open={Boolean(selectedPackage)} onOpenChange={open => { if (!open) { setSelectedPackage(null); setPackageTested(false) } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{selectedPackage ? packageName(selectedPackage) : null}</DialogTitle><DialogDescription>{selectedPackage ? packageDescription(selectedPackage) : null}</DialogDescription></DialogHeader>
        {selectedPackage ? <div className="space-y-4">
          {packageFeedback ? <Notice {...packageFeedback} onDismiss={() => setPackageFeedback(null)} /> : null}
          <div className="flex flex-wrap gap-2"><Badge variant={selectedPackage.status === "experimental" ? "warning" : "secondary"}>{t(`toolCatalog.status.${selectedPackage.status}`)}</Badge>{selectedPackage.operations.map(operation => <Badge key={operation} variant="secondary">{operationLabel(operation)}</Badge>)}</div>
          {selectedPackage.setup_instructions.map((instruction, index) => <p key={index} className="text-sm text-muted-foreground">{t(`toolCatalog.packages.${selectedPackage.id}.instructions.${index}`, { defaultValue: instruction })}</p>)}
          <div className="space-y-2"><Label htmlFor="catalog-tool-name">{t("toolCatalog.toolName")}</Label><Input id="catalog-tool-name" value={setup.name ?? ""} onChange={event => { setPackageTested(false); setPackageFeedback(null); setSetup(value => ({ ...value, name: event.target.value })) }} /></div>
          <div className="space-y-2"><Label htmlFor="catalog-tool-description">{t("toolCatalog.toolDescription")}</Label><Textarea id="catalog-tool-description" value={setup.description ?? ""} onChange={event => { setPackageTested(false); setPackageFeedback(null); setSetup(value => ({ ...value, description: event.target.value })) }} /></div>
          {selectedPackage.id !== "github-account-api" ? <div className="space-y-2"><Label htmlFor="catalog-tool-url">{t("toolCatalog.endpoint")}</Label><Input id="catalog-tool-url" type="url" placeholder="https://api.example.com/resource" value={setup.url ?? ""} onChange={event => { setPackageTested(false); setPackageFeedback(null); setSetup(value => ({ ...value, url: event.target.value })) }} /></div> : null}
          {selectedPackage.id === "web-api-request" ? <><div className="space-y-2"><Label htmlFor="catalog-method">{t("toolCatalog.method")}</Label><select id="catalog-method" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={setup.method} onChange={event => { setPackageTested(false); setPackageFeedback(null); setSetup(value => ({ ...value, method: event.target.value })) }}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map(method => <option key={method}>{method}</option>)}</select></div><div className="space-y-2"><Label htmlFor="catalog-schema">{t("toolCatalog.requestSchema")}</Label><Textarea id="catalog-schema" className="font-mono text-xs" value={schemaText} onChange={event => updatePackageJson("schema", event.target.value)} />{!schemaValid ? <p className="text-xs text-destructive">{t("toolCatalog.invalidJson")}</p> : null}</div><div className="space-y-2"><Label htmlFor="catalog-test-args">{t("toolCatalog.testArguments")}</Label><Textarea id="catalog-test-args" className="font-mono text-xs" value={argumentsText} onChange={event => updatePackageJson("arguments", event.target.value)} />{!argumentsValid ? <p className="text-xs text-destructive">{t("toolCatalog.invalidJson")}</p> : null}</div></> : null}
          {selectedPackage.id === "web-api-request" || selectedPackage.id === "generic-mcp-http" ? <div className="space-y-2"><Label htmlFor="catalog-auth">{t("toolCatalog.authentication")}</Label><select id="catalog-auth" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={setup.auth_mode} onChange={event => { setPackageTested(false); setPackageFeedback(null); setSetup(value => ({ ...value, auth_mode: event.target.value, secret_id: event.target.value === "none" ? null : value.secret_id })) }}><option value="none">{t("toolCatalog.authNone")}</option><option value="bearer">{t("toolCatalog.authBearer")}</option>{selectedPackage.id === "web-api-request" ? <option value="api_key">{t("toolCatalog.authApiKey")}</option> : null}</select></div> : null}
          {(selectedPackage.id === "github-account-api" || setup.auth_mode !== "none") ? <div className="space-y-2"><Label htmlFor="catalog-secret">{t("toolCatalog.secret")}</Label>{secrets.length ? <select id="catalog-secret" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={setup.secret_id ?? ""} onChange={event => { setPackageTested(false); setPackageFeedback(null); setSetup(value => ({ ...value, secret_id: event.target.value || null })) }}><option value="">{t("toolCatalog.selectSecret")}</option>{secrets.map(secret => <option key={secret.id} value={secret.id}>{secret.name}</option>)}</select> : <p className="text-sm text-muted-foreground">{t("toolCatalog.noSecrets")} <a className="text-primary underline" href="/secrets">{t("toolCatalog.openSecrets")}</a></p>}</div> : null}
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("toolCatalog.secretSafety")}</p>
        </div> : null}
        <DialogFooter><Button variant="outline" onClick={() => setSelectedPackage(null)}>{t("common.cancel")}</Button><Button variant="outline" disabled={!canTestPackage || !schemaValid || !argumentsValid || packageTesting} onClick={() => void testPackage()}>{packageTesting ? t("toolCatalog.testing") : t("toolCatalog.testConnection")}</Button><Button disabled={!packageTested || busy === `catalog:${selectedPackage?.id}`} onClick={() => void addPackageTool()}>{t("toolCatalog.addTool")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
