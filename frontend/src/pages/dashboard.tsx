import { Activity, AlertTriangle, Bot, Leaf, Network, Play, PlaySquare, Plus, RefreshCw, Sparkles, Wrench } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { EmptyState } from "@/components/empty-state"
import { AgentTreeMark, BranchMotif } from "@/components/agenttree-mark"
import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type DashboardSummary } from "@/lib/api"

function when(value: string | null, language: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function DashboardPage() {
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
    <header className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary via-primary to-primary/85 px-5 py-7 text-primary-foreground shadow-[var(--shadow-lifted)] sm:px-8 sm:py-9">
      <div className="brand-grid absolute inset-0 opacity-15" /><BranchMotif className="absolute -bottom-8 -right-6 h-44 w-80 text-primary-foreground/30" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><div className="hidden size-14 shrink-0 place-items-center rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 sm:grid"><AgentTreeMark className="size-9" /></div><div><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70"><Leaf className="size-3.5" />AgentTree Studio</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{t("dashboardWelcome.title")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/78 sm:text-base">{t("dashboardWelcome.description")}</p></div></div><Button className="self-start border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground shadow-none hover:bg-primary-foreground/18 hover:text-primary-foreground" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />{t("dashboard.refresh")}</Button></div>
    </header>
    {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
    {loading || !summary ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32" />)}</div> : <>
      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2 id="overview-heading" className="text-lg font-semibold">{t("dashboard.overview")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Network} label={t("dashboard.trees")} value={summary.metrics.trees.total} detail={t("dashboard.treesHint", { ready: summary.metrics.trees.ready, draft: summary.metrics.trees.draft })} tone="brand" />
          <Metric icon={PlaySquare} label={t("dashboard.runs")} value={summary.metrics.runs.total} detail={t("dashboard.runsHint", { today: summary.metrics.runs.today, running: summary.metrics.runs.running })} tone="earth" />
          <Metric icon={Activity} label={t("status.running")} value={summary.metrics.runs.running} detail={t("dashboard.resourcesHint", { providers: summary.metrics.providers.connected, models: summary.metrics.providers.usable_models, tools: summary.metrics.tools.enabled })} tone="active" />
          <Metric icon={Sparkles} label={t("dashboard.successRate")} value={summary.metrics.runs.success_rate == null ? "—" : `${summary.metrics.runs.success_rate}%`} detail={t("dashboard.successHint", { completed: summary.metrics.runs.completed, failed: summary.metrics.runs.failed })} tone="success" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card><CardHeader><CardTitle>{t("dashboard.recentRuns")}</CardTitle><CardDescription>{t("dashboard.recentRunsHelp")}</CardDescription></CardHeader><CardContent className="space-y-2">{summary.recent_runs.length ? summary.recent_runs.map((run) => <button key={run.id} onClick={() => navigate(`/runs/${run.id}`)} className="flex w-full items-center justify-between gap-4 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60"><div className="min-w-0"><p className="truncate font-medium">{run.tree_name}</p><p className="mt-1 text-xs text-muted-foreground">{when(run.started_at, i18n.language)} · {run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</p></div><RunStatusBadge status={run.status} /></button>) : <EmptyState icon={PlaySquare} title={t("dashboard.noRuns")} description={t("dashboard.noRunsHelp")} />}</CardContent></Card>

        <Card><CardHeader><CardTitle>{t("dashboard.quickActions")}</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1"><Quick icon={Plus} label={t("dashboard.createTree")} onClick={() => navigate("/trees/new")} /><Quick icon={Sparkles} label={t("dashboard.connectProvider")} onClick={() => navigate("/providers")} /><Quick icon={Wrench} label={t("dashboard.addTool")} onClick={() => navigate("/tools")} /><Quick icon={Play} label={t("dashboard.viewRuns")} onClick={() => navigate("/runs")} /></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>{t("dashboard.yourTrees")}</CardTitle><CardDescription>{t("dashboard.yourTreesHelp")}</CardDescription></CardHeader><CardContent>{summary.trees.length ? <div className="grid gap-3 lg:grid-cols-2">{summary.trees.map((tree) => <div key={tree.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{tree.name}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tree.description || t("trees.noDescription")}</p></div><Badge variant={tree.status === "ready" || tree.status === "published" ? "success" : "secondary"}>{t(`status.${tree.status}`)}</Badge></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{t("dashboard.agents", { count: tree.agent_count })}</span><span>{t("dashboard.runCount", { count: tree.run_count })}</span><span>{t("dashboard.lastRun")}: {when(tree.last_run_at, i18n.language)}</span></div>{tree.provider_summary.length ? <p className="mt-3 truncate text-xs text-muted-foreground">{tree.provider_summary.join(" · ")}</p> : null}<div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => navigate(`/trees/${tree.id}`)}>{t("common.open")}</Button><Button size="sm" onClick={() => navigate(`/trees/${tree.id}`)}><Play className="size-3.5" />{t("common.testRun")}</Button><Button size="sm" variant="ghost" onClick={() => navigate(`/trees/${tree.id}`)}>{t("common.connect")}</Button></div></div>)}</div> : <EmptyState icon={Network} title={t("dashboard.noTrees")} description={t("dashboard.noTreesHelp")} />}</CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("dashboard.providerStatus")}</CardTitle><CardDescription>{t("dashboard.providerStatusHelp")}</CardDescription></CardHeader><CardContent className="space-y-2">{summary.providers.length ? summary.providers.map((provider) => <button key={provider.id} onClick={() => navigate("/providers")} className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted/60"><div><p className="font-medium">{provider.name}</p><p className="mt-1 text-xs text-muted-foreground">{provider.provider_type.toUpperCase()} · {t("dashboard.modelsReady", { count: provider.usable_models })}</p></div><div className="text-right"><Badge variant={provider.status === "connected" ? "success" : provider.status === "error" ? "destructive" : "secondary"}>{t(`status.${provider.status === "not_configured" ? "notConfigured" : provider.status}`)}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{when(provider.last_checked_at, i18n.language)}</p></div></button>) : <EmptyState icon={Sparkles} title={t("dashboard.noProviders")} description={t("dashboard.noProvidersHelp")} />}</CardContent></Card>
        <Card><CardHeader><CardTitle>{t("dashboard.needsAttention")}</CardTitle><CardDescription>{t("dashboard.needsAttentionHelp")}</CardDescription></CardHeader><CardContent className="space-y-2">{summary.needs_attention.length ? summary.needs_attention.map((item) => { const key = `dashboard.attention.${item.kind}`; return <div key={item.id} className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{i18n.exists(`${key}.title`) ? t(`${key}.title`) : item.title}</p><p className="mt-1 text-xs text-muted-foreground">{i18n.exists(`${key}.message`) ? t(`${key}.message`, { name: item.resource_name, related: item.related_names.join(", ") }) : item.message}</p><Button className="mt-2 px-0" size="sm" variant="ghost" onClick={() => navigate(item.action_href)}>{t("dashboard.attention.action")}</Button></div></div> }) : <div className="rounded-lg border border-dashed border-border p-8 text-center"><Bot className="mx-auto size-6 text-emerald-600" /><p className="mt-3 font-medium">{t("dashboard.allGood")}</p><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.allGoodHelp")}</p></div>}</CardContent></Card>
      </div>
    </>}
  </div>
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Network; label: string; value: number | string; detail: string; tone: "brand" | "earth" | "active" | "success" }) {
  const toneClass = tone === "earth" ? "bg-earth/10 text-earth" : tone === "active" ? "bg-info/10 text-info" : tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
  return <Card className="group hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[var(--shadow-lifted)]"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className={`grid size-9 place-items-center rounded-xl ${toneClass}`}><Icon className="size-4" /></span></div><p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></CardContent></Card>
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return <Button variant="outline" className="justify-start" onClick={onClick}><Icon className="size-4" />{label}</Button>
}
