import { ArrowLeft, Boxes, Eye, Network, Pencil, Play, Settings, Wrench } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { TestRunDialog } from "@/components/test-run-dialog"
import { ConnectTab } from "@/components/tree/connect-tab"
import { AgentDetails } from "@/components/tree/agent-details"
import { ToolStatusBadge } from "@/components/tools/tool-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { api, type ProviderConnection, type ProviderModel, type Run, type ToolConnection, type TreeDetail } from "@/lib/api"

const tabs = ["Overview", "Agents", "Tools", "Connect", "Runs", "Versions", "Settings"] as const

export function TreeDetailPage() {
  const { t } = useTranslation()
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

  const managers = tree.version.agents.filter((agent) => agent.agent_type === "manager")
  const specialists = tree.version.agents.filter((agent) => agent.agent_type === "specialist")

  return (
    <div className="space-y-7">
      <div className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-secondary/55 via-card to-card p-5 shadow-[var(--shadow-soft)] sm:flex-row sm:items-end sm:justify-between sm:p-6"><div><button className="mb-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary" onClick={() => navigate("/trees")}><ArrowLeft className="size-3.5" />{t("trees.back")}</button><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.03em]">{tree.name}</h1><Badge variant={tree.status === "ready" || tree.status === "published" ? "success" : "secondary"}>{t(`status.${tree.status}`)}</Badge></div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{tree.description || t("trees.noDescription")}</p></div><div className="flex flex-wrap gap-2">{tree.status === "draft" ? <Button variant="outline" onClick={() => navigate(`/trees/${tree.id}/edit`)}><Pencil className="size-4" />{t("common.edit")}</Button> : null}<Button onClick={() => setTestOpen(true)}><Play className="size-4" />{t("common.testRun")}</Button></div></div>
      {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/65 p-1.5 shadow-sm [scrollbar-width:none]">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={cn("whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === item ? "bg-accent text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{item === "Overview" ? t("trees.overview") : item === "Agents" ? t("trees.agents") : item === "Connect" ? t("trees.connect") : item === "Versions" ? t("trees.versions") : item === "Settings" ? t("trees.settings") : item}</button>)}</div>

      {tab === "Overview" ? <Overview tree={tree} /> : null}
      {tab === "Agents" ? <AgentsTab tree={tree} managers={managers} specialists={specialists} providers={providers} models={models} tools={tools} /> : null}
      {tab === "Tools" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="size-5" />Tool assignments</CardTitle><CardDescription>Executable Tools registered and permission-bound to Specialists at runtime. Tool use remains explicit; Test Run does not autonomously plan calls.</CardDescription></CardHeader><CardContent>{tree.version.tool_assignments.length === 0 ? <p className="text-sm text-muted-foreground">No tools assigned.</p> : <div className="space-y-2">{tree.version.agents.flatMap((agent) => tools.filter((tool) => assignments.has(`${agent.id}:${tool.id}`)).map((tool) => <div key={`${agent.id}:${tool.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><span className="font-medium">{tool.name}</span><span className="ml-2 text-xs text-muted-foreground">{tool.tool_type === "mcp" ? "MCP" : "HTTP API"}</span></div><div className="flex items-center gap-3"><ToolStatusBadge status={tool.status} /><span className="text-muted-foreground">{agent.name}</span></div></div>))}</div>}</CardContent></Card> : null}
      {tab === "Connect" ? <ConnectTab tree={tree} /> : null}
      {tab === "Runs" ? <RunsTab runs={runs} onView={(run) => navigate(`/runs/${run.id}`)} /> : null}
      {tab === "Versions" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="size-5" />Versions</CardTitle><CardDescription>Initial versioning foundation</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between rounded-lg border border-border p-4"><div><p className="font-medium">Version {tree.version.version_number}</p><p className="mt-1 text-xs text-muted-foreground">Created {new Date(tree.version.created_at).toLocaleString()}</p></div><Badge variant="secondary">{tree.version.status}</Badge></div></CardContent></Card> : null}
      {tab === "Settings" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings className="size-5" />Tree settings</CardTitle><CardDescription>Destructive actions apply to every version.</CardDescription></CardHeader><CardContent><Button variant="outline" className="border-red-500/30 text-red-600 hover:bg-red-500/10" onClick={() => void remove()}>Delete Tree</Button></CardContent></Card> : null}
      <TestRunDialog tree={tree} open={testOpen} onOpenChange={setTestOpen} onFinished={(run) => setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])} />
    </div>
  )
}

function shortValue(value: unknown) {
  const rendered = typeof value === "string" ? value : JSON.stringify(value)
  return rendered.length > 70 ? `${rendered.slice(0, 67)}…` : rendered
}

function RunsTab({ runs, onView }: { runs: Run[]; onView: (run: Run) => void }) {
  return <Card><CardHeader><CardTitle>Run history</CardTitle><CardDescription>Independent invocations of this reusable Tree.</CardDescription></CardHeader><CardContent className="p-0">{runs.length ? <Table><TableHeader><TableRow><TableHead>Run ID</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead><TableHead>Started</TableHead><TableHead>Duration</TableHead><TableHead>Input</TableHead><TableHead>Output</TableHead><TableHead /></TableRow></TableHeader><TableBody>{runs.map((run) => <TableRow key={run.id}><TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell><TableCell><RunStatusBadge status={run.status} /></TableCell><TableCell className="text-xs text-muted-foreground">{run.invocation_source}</TableCell><TableCell>{new Date(run.started_at).toLocaleString()}</TableCell><TableCell>{run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</TableCell><TableCell className="max-w-40 truncate text-xs text-muted-foreground">{shortValue(run.input)}</TableCell><TableCell className="max-w-40 truncate text-xs text-muted-foreground">{run.output ? shortValue(run.output.value) : run.error_code ?? "—"}</TableCell><TableCell><Button variant="ghost" onClick={() => onView(run)}><Eye className="size-4" />View Run</Button></TableCell></TableRow>)}</TableBody></Table> : <p className="p-8 text-center text-sm text-muted-foreground">No Runs yet. Invoke this Tree from Test Run or its runtime API.</p>}</CardContent></Card>
}

function Overview({ tree }: { tree: TreeDetail }) {
  const stats = [
    ["Current version", `v${tree.version_number}`], ["Root Agent", tree.root?.name ?? "Not configured"],
    ["Managers", String(tree.managers_count)], ["Specialists", String(tree.specialists_count)],
    ["Runs", "Reusable runtime"], ["Invocation", "API or Studio"],
  ]
  return <div className="space-y-4"><Card><CardContent className="p-5"><p className="font-medium">This Tree is a reusable AgentTree runtime and can receive multiple Runs.</p><p className="mt-1 text-sm text-muted-foreground">Each invocation uses the current Tree version and creates its own input, result, trace, and delivery outcomes.</p></CardContent></Card><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stats.map(([label, value]) => <Card key={label}><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{value}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle className="text-base">Provider usage</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{tree.provider_usage.length ? tree.provider_usage.map((provider) => <Badge key={provider} variant="secondary">{provider}</Badge>) : <p className="text-sm text-muted-foreground">No providers selected.</p>}</CardContent></Card></div>
}

function AgentsTab({ tree, managers, specialists, providers, models, tools }: { tree: TreeDetail; managers: TreeDetail["version"]["agents"]; specialists: TreeDetail["version"]["agents"]; providers: ProviderConnection[]; models: ProviderModel[]; tools: ToolConnection[] }) {
  const assigned = (agentId: string) => tree.version.tool_assignments.filter((item) => item.agent_config_id === agentId).map((item) => item.tool_connection_id)
  const row = (agent: TreeDetail["version"]["agents"][number], childrenCount: number) => <AgentDetails agent={agent} agents={tree.version.agents} providers={providers} models={models} tools={tools} assignedToolIds={assigned(agent.id)} childrenCount={childrenCount} />
  return <Card className="overflow-hidden"><CardHeader className="border-b border-border/70 bg-secondary/20"><CardTitle className="flex items-center gap-2"><Network className="size-5 text-primary" />Agent hierarchy</CardTitle><CardDescription>Open an Agent to understand its model, role, capabilities, instructions, and Tool permissions.</CardDescription></CardHeader><CardContent className="pt-6"><div className="mx-auto max-w-5xl">{tree.root ? <div className="relative pb-8 after:absolute after:bottom-0 after:left-6 after:h-8 after:w-px after:bg-primary/35 sm:after:left-1/2">{row(tree.root, managers.length)}</div> : null}<div className="space-y-7">{managers.map((manager) => { const children = specialists.filter((specialist) => specialist.parent_agent_id === manager.id); return <div key={manager.id} className="relative pl-7 before:absolute before:left-0 before:top-7 before:h-px before:w-7 before:bg-primary/35 after:absolute after:-top-8 after:bottom-0 after:left-0 after:w-px after:bg-primary/25 sm:pl-10 sm:before:w-10"><div>{row(manager, children.length)}</div>{children.length ? <div className="ml-4 mt-4 space-y-3 border-l border-border pl-6 sm:ml-8">{children.map((specialist) => <div key={specialist.id} className="relative before:absolute before:-left-6 before:top-7 before:h-px before:w-6 before:bg-border">{row(specialist, 0)}</div>)}</div> : null}</div> })}</div></div></CardContent></Card>
}
