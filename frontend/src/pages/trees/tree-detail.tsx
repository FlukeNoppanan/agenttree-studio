import { useAuth } from "@/auth"
import { Activity, ArrowLeft, Boxes, Eye, Pencil, Play, Settings, Wrench } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { TestRunDialog } from "@/components/test-run-dialog"
import { ConnectTab } from "@/components/tree/connect-tab"
import { AgentHierarchy } from "@/components/tree/agent-hierarchy"
import { ToolStatusBadge } from "@/components/tools/tool-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardDescription, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { api, type ProviderConnection, type ProviderModel, type Run, type ToolConnection, type TreeDetail } from "@/lib/api"

const tabs = ["Overview", "Agents", "Tools", "Connect", "Runs", "Versions", "Settings"] as const

export function TreeDetailPage() {
  const { t, i18n } = useTranslation()
  const { can } = useAuth()
  const { treeId } = useParams()
  const navigate = useNavigate()
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [tools, setTools] = useState<ToolConnection[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [providers, setProviders] = useState<ProviderConnection[]>([])
  const [models, setModels] = useState<ProviderModel[]>([])
  const [testOpen, setTestOpen] = useState(false)
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview")
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    if (!treeId) return
    Promise.all([api.getTree(treeId), api.listTools(), api.listTreeRuns(treeId), api.listProviders()])
      .then(async ([item, toolItems, runItems, providerItems]) => {
        const modelItems = (await Promise.all(providerItems.map((provider) => api.listModels(provider.id, true)))).flat()
        setTree(item); setTools(toolItems); setRuns(runItems); setProviders(providerItems); setModels(modelItems)
      })
      .catch((error) => setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load Tree" }))
      .finally(() => setLoading(false))
  }, [treeId])

  const assignments = useMemo(() => new Map(tree?.version.tool_assignments.map((item) => [`${item.agent_config_id}:${item.tool_connection_id}`, item]) ?? []), [tree])

  async function remove() {
    if (!tree || !window.confirm(`Delete “${tree.name}” and all versions?`)) return
    try { await api.deleteTree(tree.id); navigate("/trees") }
    catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete Tree" }) }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  if (!tree) return <div className="space-y-4">{notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}<Button variant="outline" onClick={() => navigate("/trees")}><ArrowLeft className="size-4" />Back to Trees</Button></div>

  return (
    <div className="space-y-7">
      <div className="flex min-w-0 flex-col gap-5 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between"><div className="min-w-0"><button className="mb-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary" onClick={() => navigate("/trees")}><ArrowLeft className="size-3.5" />{t("trees.back")}</button><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-3xl font-semibold tracking-[-0.03em]">{tree.name}</h1><Badge variant={tree.status === "ready" || tree.status === "published" ? "success" : "secondary"}>{t(`status.${tree.status}`)}</Badge></div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{tree.description || t("trees.noDescription")}</p><p className="mt-3 text-xs text-muted-foreground">{tree.version.agents.length} {t("trees.agents")} · {new Date(tree.updated_at).toLocaleString(i18n.language)}</p></div><div className="flex flex-wrap gap-2">{tree.status === "draft" || tree.status === "ready" ? <Button variant="outline" onClick={() => navigate(`/trees/${tree.id}/edit`)}><Pencil className="size-4" />{t("treeV3.editTree")}</Button> : null}<Button variant="outline" onClick={() => navigate(`/trees/${tree.id}/live`)}><Activity className="size-4" />{t("live.title")}</Button><Button onClick={() => setTestOpen(true)}><Play className="size-4" />{t("common.testRun")}</Button></div></div>
      {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
      <div className="studio-tabs">{tabs.map((item) => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)} className={cn("whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === item ? "text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{item === "Overview" ? t("trees.overview") : item === "Agents" ? t("trees.agents") : item === "Connect" ? t("trees.connect") : item === "Versions" ? t("trees.versions") : item === "Settings" ? t("trees.settings") : item === "Tools" ? t("nav.tools") : t("nav.runs")}</button>)}</div>

      {tab === "Overview" ? <div className="space-y-5"><AgentHierarchy canEdit={can("manage_trees_agents")} tree={tree} providers={providers} models={models} tools={tools} /><Overview tree={tree} /></div> : null}
      {tab === "Agents" ? <AgentHierarchy canEdit={can("manage_trees_agents")} tree={tree} providers={providers} models={models} tools={tools} /> : null}
      {tab === "Tools" ? <section className="min-w-0"><div className="py-4"><CardTitle className="flex items-center gap-2"><Wrench className="size-5" />{t("designV3.toolAssignments")}</CardTitle><CardDescription>{t("designV3.toolsHelp")}</CardDescription></div><div>{tree.version.tool_assignments.length === 0 ? <p className="text-sm text-muted-foreground">{t("designV3.noTools")}</p> : <div className="space-y-2">{tree.version.agents.flatMap((agent) => tools.filter((tool) => assignments.has(`${agent.id}:${tool.id}`)).map((tool) => <div key={`${agent.id}:${tool.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><span className="font-medium">{tool.name}</span><span className="ml-2 text-xs text-muted-foreground">{tool.tool_type === "mcp" ? "MCP" : "HTTP API"}</span></div><div className="flex items-center gap-3"><ToolStatusBadge status={tool.status} /><span className="text-muted-foreground">{agent.name}</span></div></div>))}</div>}</div></section> : null}
      {tab === "Connect" ? <ConnectTab tree={tree} /> : null}
      {tab === "Runs" ? <RunsTab runs={runs} onView={(run) => navigate(`/runs/${run.id}`)} /> : null}
      {tab === "Versions" ? <section className="min-w-0"><div className="py-4"><CardTitle className="flex items-center gap-2"><Boxes className="size-5" />{t("trees.versions")}</CardTitle><CardDescription>{t("designV3.versionsHelp")}</CardDescription></div><div><div className="flex items-center justify-between rounded-lg border border-border p-4"><div><p className="font-medium">{t("designV3.version")} {tree.version.version_number}</p><p className="mt-1 text-xs text-muted-foreground">{t("treeV3.created")} {new Date(tree.version.created_at).toLocaleString(i18n.language)}</p></div><Badge variant="secondary">{t(`status.${tree.version.status}`)}</Badge></div></div></section> : null}
      {tab === "Settings" ? <section className="min-w-0"><div className="py-4"><CardTitle className="flex items-center gap-2"><Settings className="size-5" />{t("trees.settings")}</CardTitle><CardDescription>{t("designV3.settingsHelp")}</CardDescription></div><div><Button variant="outline" className="border-red-500/30 text-red-600 hover:bg-red-500/10" onClick={() => void remove()}>{t("designV3.deleteTree")}</Button></div></section> : null}
      <TestRunDialog tree={tree} open={testOpen} onOpenChange={setTestOpen} onFinished={(run) => setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])} />
    </div>
  )
}

function shortValue(value: unknown) {
  const rendered = typeof value === "string" ? value : JSON.stringify(value)
  return rendered.length > 70 ? `${rendered.slice(0, 67)}…` : rendered
}

function RunsTab({ runs, onView }: { runs: Run[]; onView: (run: Run) => void }) {
  const { t, i18n } = useTranslation()
  return <section className="min-w-0"><div className="py-4"><CardTitle>{t("designV3.history")}</CardTitle><CardDescription>{t("designV3.historyHelp")}</CardDescription></div><div className="p-0">{runs.length ? <Table><TableHeader><TableRow><TableHead>Run ID</TableHead><TableHead>{t("common.status")}</TableHead><TableHead>{t("designV3.source")}</TableHead><TableHead>{t("runs.started")}</TableHead><TableHead>{t("runs.duration")}</TableHead><TableHead>{t("live.input")}</TableHead><TableHead>{t("designV3.output")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{runs.map((run) => <TableRow key={run.id}><TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell><TableCell><RunStatusBadge status={run.status} /></TableCell><TableCell className="text-xs text-muted-foreground">{run.invocation_source}</TableCell><TableCell>{new Date(run.started_at).toLocaleString(i18n.language)}</TableCell><TableCell>{run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</TableCell><TableCell className="max-w-40 truncate text-xs text-muted-foreground">{shortValue(run.input)}</TableCell><TableCell className="max-w-40 truncate text-xs text-muted-foreground">{run.output ? shortValue(run.output.value) : run.error_code ?? "—"}</TableCell><TableCell><Button variant="ghost" onClick={() => onView(run)}><Eye className="size-4" />{t("runs.view")}</Button></TableCell></TableRow>)}</TableBody></Table> : <p className="p-8 text-center text-sm text-muted-foreground">{t("designV3.emptyExecutionsHelp")}</p>}</div></section>
}

function Overview({ tree }: { tree: TreeDetail }) {
  const { t, i18n } = useTranslation()
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value))
  const stats = [
    [t("common.status"), t(`status.${tree.status}`)], [t("trees.agents"), String(tree.version.agents.length)],
    [t("agents.provider"), String(tree.provider_usage.length)], [t("agents.tools"), String(new Set(tree.version.tool_assignments.map(item => item.tool_connection_id)).size)],
    [t("treeV3.created"), date(tree.created_at)], [t("treeV3.updated"), date(tree.updated_at)],
  ]
  return <div className="space-y-4">
    <dl className="metric-strip">{stats.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>
  </div>
}
