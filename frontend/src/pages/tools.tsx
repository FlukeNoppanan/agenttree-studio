import { Plus, Wrench } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/empty-state"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { ToolCard } from "@/components/tools/tool-card"
import { ToolForm } from "@/components/tools/tool-form"
import { ToolTestDialog } from "@/components/tools/tool-test-dialog"
import type { EligibleSpecialist } from "@/components/tools/tool-assignment-selector"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Secret, type ToolConnection } from "@/lib/api"

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
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [toolItems, secretItems, trees] = await Promise.all([api.listTools(), api.listSecrets(), api.listTrees()])
      const details = await Promise.all(trees.map((tree) => api.getTree(tree.id)))
      setTools(toolItems)
      setSecrets(secretItems)
      setSpecialists(details.flatMap((tree) => tree.version.agents
        .filter((agent) => agent.agent_type === "specialist")
        .map((agent) => ({ id: agent.id, name: agent.name, treeName: tree.name }))))
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load Tools" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openCreate() { setEditing(null); setFormOpen(true) }
  function openEdit(tool: ToolConnection) { setEditing(tool); setFormOpen(true) }

  async function testConnection(tool: ToolConnection) {
    setBusy(`test:${tool.id}`)
    try {
      const result = await api.testTool(tool.id)
      await load()
      setNotice({ tone: result.tool.status === "connected" ? "success" : "error", message: result.message })
    } catch (error) {
      await load()
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Connection test failed" })
    } finally { setBusy(null) }
  }

  async function discover(tool: ToolConnection) {
    setBusy(`discover:${tool.id}`)
    try {
      const result = await api.discoverTool(tool.id)
      await load()
      setNotice({ tone: "success", message: `Discovered ${result.tools.length} MCP Tool${result.tools.length === 1 ? "" : "s"} from ${tool.name}.` })
    } catch (error) {
      await load()
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "MCP discovery failed" })
    } finally { setBusy(null) }
  }

  async function remove(tool: ToolConnection) {
    if (!window.confirm(`Delete “${tool.name}” and its Specialist assignments?`)) return
    setBusy(`delete:${tool.id}`)
    try {
      await api.deleteTool(tool.id)
      await load()
      setNotice({ tone: "success", message: `${tool.name} deleted.` })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete Tool" })
    } finally { setBusy(null) }
  }

  return <div className="space-y-7"><PageHeader title={t("tools.title")} description={t("tools.description")} action={<Button onClick={openCreate}><Plus className="size-4" />{t("tools.add")}</Button>} />{notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}{loading ? <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : tools.length ? <div className="grid gap-4 lg:grid-cols-2">{tools.map((tool) => <ToolCard key={tool.id} tool={tool} busy={busy?.endsWith(tool.id) ?? false} onTest={() => void testConnection(tool)} onDiscover={() => void discover(tool)} onExecute={() => setTesting(tool)} onEdit={() => openEdit(tool)} onDelete={() => void remove(tool)} />)}</div> : <EmptyState icon={Wrench} title={t("tools.empty")} description={t("tools.emptyHelp")} />}<ToolForm open={formOpen} onOpenChange={setFormOpen} tool={editing} secrets={secrets} specialists={specialists} onComplete={() => { void load(); setNotice({ tone: "success", message: editing ? "Tool updated." : "Tool created." }) }} /><ToolTestDialog tool={testing} open={Boolean(testing)} onOpenChange={(open) => { if (!open) setTesting(null) }} /></div>
}
