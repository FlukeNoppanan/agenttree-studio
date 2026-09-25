import { Plus, Wrench } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { api, type DiscoveredTool, type Secret, type ToolConnection } from "@/lib/api"

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [toolResult, secretResult, treeResult] = await Promise.allSettled([api.listTools(), api.listSecrets(), api.listTrees()])
      if (toolResult.status === "rejected") throw toolResult.reason
      setTools(toolResult.value)
      setSecrets(secretResult.status === "fulfilled" ? secretResult.value : [])
      const detailResults = treeResult.status === "fulfilled"
        ? await Promise.allSettled(treeResult.value.map((tree) => api.getTree(tree.id)))
        : []
      const details = detailResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      setSpecialists(details.flatMap((tree) => tree.version.agents
        .filter((agent) => agent.agent_type === "specialist")
        .map((agent) => ({ id: agent.id, name: agent.name, treeName: tree.name }))))
      const supplementalError = secretResult.status === "rejected" || treeResult.status === "rejected" || detailResults.some((result) => result.status === "rejected")
      if (supplementalError) setNotice({ tone: "error", message: "Tools loaded, but some Secret or Specialist assignment options are temporarily unavailable." })
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

  return <div className="space-y-7"><PageHeader title={t("tools.title")} description={t("tools.description")} action={<Button onClick={openCreate}><Plus className="size-4" />{t("tools.add")}</Button>} />{notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}{loading ? <div className="resource-list"><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : tools.length ? <div className="resource-list">{tools.map((tool) => <div key={tool.id} id={`tool-${tool.id}`} className={focusedToolId === tool.id ? "rounded-2xl ring-2 ring-primary" : undefined}><ToolCard tool={tool} operation={operationFor(tool.id)} feedback={feedback[tool.id]} onTest={() => void testConnection(tool)} onDiscover={() => void discover(tool)} onExecute={() => setTesting(tool)} onEdit={() => openEdit(tool)} onDelete={() => setDeletingTool(tool)} /></div>)}</div> : <EmptyState icon={Wrench} title={t("tools.empty")} description={t("tools.emptyHelp")} />}<ToolForm open={formOpen} onOpenChange={setFormOpen} tool={editing} secrets={secrets} specialists={specialists} onComplete={() => { void load(); setNotice({ tone: "success", message: editing ? "Tool updated." : "Tool created." }) }} /><ToolTestDialog tool={testing} open={Boolean(testing)} onOpenChange={(open) => { if (!open) setTesting(null) }} /><McpDiscoveryDialog connectionName={discovery?.connectionName ?? ""} tools={discovery?.tools ?? []} open={Boolean(discovery)} onOpenChange={(open) => { if (!open) setDiscovery(null) }} /><ResourceDependencyDialog resource={deletingTool && { id: deletingTool.id, name: deletingTool.name, type: "tool" }} inspect={api.getToolDependencies} remove={api.deleteTool} onClose={() => setDeletingTool(null)} onDeleted={async () => { await load(); setNotice({ tone: "success", message: t("resourceDeletion.deleted", { type: t("resourceDeletion.types.tool") }) }) }} /></div>
}
