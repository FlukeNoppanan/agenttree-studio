import { CreateTreeMenu } from "@/components/create-tree-menu"
import { Activity, AlertTriangle, Bot, Network, Play, PlaySquare, Plus, RefreshCw, Sparkles, Wrench, Users } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardDescription, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type DashboardSummary } from "@/lib/api"
import { useAuth } from "@/auth"
import { LimitedDashboard } from "@/pages/limited-dashboard"
import { GettingStarted } from "@/components/getting-started"

function when(value: string | null, language: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function DashboardPage() {
  const { user } = useAuth()
  return user?.is_admin ? <AdminDashboard /> : <LimitedDashboard />
}

function AdminDashboard() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setSummary(await api.getDashboardSummary()) }
    catch { setError(t("dashboard.loadError")) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void load() }, [load])

  return <div className="space-y-7">
    <PageHeader title={t("dashboardUx.welcomeBack", { username: user?.username })} description={t("dashboardWelcome.description")} action={<><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />{t("dashboard.refresh")}</Button><CreateTreeMenu /></>} />
    <GettingStarted />
    {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
    {loading || !summary ? <div className="metric-strip">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32" />)}</div> : <>
      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2 id="overview-heading" className="text-lg font-semibold">{t("dashboard.overview")}</h2>
        <div className="metric-strip">
          <Metric icon={Network} label={t("dashboard.trees")} value={summary.metrics.trees.total} detail={t("dashboard.treesHint", { ready: summary.metrics.trees.ready, draft: summary.metrics.trees.draft })} tone="brand" />
          <Metric icon={PlaySquare} label={t("dashboard.runs")} value={summary.metrics.runs.total} detail={t("dashboard.runsHint", { today: summary.metrics.runs.today, running: summary.metrics.runs.running })} tone="earth" />
          <Metric icon={Activity} label={t("live.active")} value={summary.metrics.runs.running} detail={t("dashboard.runsHint", { today: summary.metrics.runs.today, running: summary.metrics.runs.running })} tone="active" />
          <Metric icon={Sparkles} label={t("dashboard.successRate")} value={summary.metrics.runs.success_rate == null ? "—" : `${summary.metrics.runs.success_rate}%`} detail={t("dashboard.successHint", { completed: summary.metrics.runs.completed, failed: summary.metrics.runs.failed })} tone="success" />
          <Metric icon={Sparkles} label={t("nav.providers")} value={summary.metrics.providers.total} detail={t("dashboard.modelsReady", { count: summary.metrics.providers.usable_models })} tone="success" />
          <Metric icon={Wrench} label={t("nav.tools")} value={summary.metrics.tools.total} detail={t("dashboardUx.toolsConnected", { count: summary.metrics.tools.connected })} tone="earth" />
          <Metric icon={Users} label={t("auth.users")} value={summary.metrics.users} detail={t("dashboardUx.fullSystem") } tone="brand" />
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="dashboard-panel"><div className="py-4"><CardTitle>{t("dashboard.recentRuns")}</CardTitle><CardDescription>{t("dashboard.recentRunsHelp")}</CardDescription></div><div className="space-y-2">{summary.recent_runs.length ? summary.recent_runs.map((run) => <button key={run.id} onClick={() => navigate(`/executions/${run.id}`)} className="flex w-full items-center justify-between gap-4 border-b border-border py-3 text-left transition-colors hover:bg-muted/60"><div className="min-w-0"><p className="truncate font-medium">{run.tree_name}</p><p className="mt-1 text-xs text-muted-foreground">{when(run.started_at, i18n.language)} · {run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</p></div><RunStatusBadge {...run} /></button>) : <EmptyState icon={PlaySquare} title={t("dashboard.noRuns")} description={t("dashboard.noRunsHelp")} />}</div></section>

        <section className="dashboard-panel"><div className="py-4"><CardTitle>{t("dashboard.quickActions")}</CardTitle></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1"><CreateTreeMenu /><Quick icon={Sparkles} label={t("dashboard.connectProvider")} onClick={() => navigate("/providers")} /><Quick icon={Wrench} label={t("dashboard.addTool")} onClick={() => navigate("/tools")} /><Quick icon={Users} label={t("auth.createUser")} onClick={() => navigate("/users")} /><Quick icon={Play} label={t("consolidation.viewExecutions")} onClick={() => navigate("/executions")} /></div></section>
      </div>

        <section className="dashboard-panel"><div className="py-4"><CardTitle>{t("dashboard.yourTrees")}</CardTitle><CardDescription>{t("dashboard.yourTreesHelp")}</CardDescription></div><div>{summary.trees.length ? <div className="resource-list">{summary.trees.map((tree) => <div key={tree.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{tree.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tree.description || t("trees.noDescription")}</p></div><Badge variant={tree.status === "ready" || tree.status === "published" ? "success" : "secondary"}>{t(`status.${tree.status}`)}</Badge></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{t("dashboard.agents", { count: tree.agent_count })}</span><span>{t("dashboard.runCount", { count: tree.run_count })}</span><span>{t("dashboard.lastRun")}: {when(tree.last_run_at, i18n.language)}</span></div>{tree.provider_summary.length ? <p className="mt-3 truncate text-xs text-muted-foreground">{tree.provider_summary.join(" · ")}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate(`/trees/${tree.id}`)}>{t("common.open")}</Button><Button size="sm" variant="outline" onClick={() => navigate(`/trees/${tree.id}/live`)}><Activity className="size-3.5" />{t("live.title")}</Button><Button size="sm" onClick={() => navigate(`/trees/${tree.id}`)}><Play className="size-3.5" />{t("common.testRun")}</Button><Button size="sm" variant="ghost" onClick={() => navigate(`/trees/${tree.id}?tab=connect`)}>{t("common.connect")}</Button></div></div>)}</div> : <EmptyState icon={Network} title={t("dashboard.noTrees")} description={t("dashboard.noTreesHelp")} />}</div></section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="dashboard-panel"><div className="py-4"><CardTitle>{t("dashboard.providerStatus")}</CardTitle><CardDescription>{t("dashboard.providerStatusHelp")}</CardDescription></div><div className="space-y-2">{summary.providers.length ? summary.providers.map((provider) => <button key={provider.id} onClick={() => navigate("/providers")} className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted/60"><div><p className="font-medium">{provider.name}</p><p className="mt-1 text-xs text-muted-foreground">{provider.provider_type.toUpperCase()} · {t("dashboard.modelsReady", { count: provider.usable_models })}</p></div><div className="text-right"><Badge variant={provider.status === "connected" ? "success" : provider.status === "error" ? "destructive" : "secondary"}>{t(`status.${provider.status === "not_configured" ? "notConfigured" : provider.status}`)}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{when(provider.last_checked_at, i18n.language)}</p></div></button>) : <EmptyState icon={Sparkles} title={t("dashboard.noProviders")} description={t("dashboard.noProvidersHelp")} />}</div></section>
        <section className="dashboard-panel"><div className="py-4"><CardTitle>{t("dashboard.needsAttention")}</CardTitle><CardDescription>{t("dashboard.needsAttentionHelp")}</CardDescription></div><div className="space-y-2">{summary.needs_attention.length ? summary.needs_attention.map((item) => { const key = `dashboard.attention.${item.kind}`; return <div key={item.id} className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-subtle p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{i18n.exists(`${key}.title`) ? t(`${key}.title`) : item.title}</p><p className="mt-1 text-xs text-muted-foreground">{i18n.exists(`${key}.message`) ? t(`${key}.message`, { name: item.resource_name, related: item.related_names.join(", ") }) : item.message}</p><Button className="mt-2 px-0" size="sm" variant="ghost" onClick={() => navigate(item.action_href)}>{t("dashboard.attention.action")}</Button></div></div> }) : <div className="rounded-lg border border-dashed border-border p-8 text-center"><Bot className="mx-auto size-6 text-success" /><p className="mt-3 font-medium">{t("dashboard.allGood")}</p><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.allGoodHelp")}</p></div>}</div></section>
      </div>
    </>}
  </div>
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Network; label: string; value: number | string; detail: string; tone: "brand" | "earth" | "active" | "success" }) {
  const toneClass = tone === "active" ? "text-info" : tone === "success" ? "text-success" : tone === "brand" ? "text-primary" : "text-earth"
  return <div className="min-w-28 flex-1"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`size-3.5 ${toneClass}`} />{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return <Button variant="outline" className="justify-start" onClick={onClick}><Icon className="size-4" />{label}</Button>
}
