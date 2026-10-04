import { CreateTreeMenu } from "@/components/create-tree-menu"
import { Activity, ArrowRight, AlertTriangle, Network, Play, RefreshCw, Sparkles } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    setLoading(true); setError(null)
    try { setSummary(await api.getDashboardSummary()) }
    catch { setError(t("dashboard.loadError")) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void load() }, [load])

  return <div className="operational-page dashboard-workspace dashboard-v013">
    <PageHeader title={t("dashboardUx.welcomeBack", { username: user?.username })} description={t("dashboardV013.subtitle")} action={<><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />{t("dashboard.refresh")}</Button><CreateTreeMenu /></>} />
    {error && <Notice tone="error" message={error} onDismiss={() => setError(null)} />}
    {loading || !summary ? <div className="grid gap-4 lg:grid-cols-[2fr_1fr]"><Skeleton className="h-48" /><Skeleton className="h-48" /></div> : <>
      <section className="workspace-overview" aria-labelledby="overview-heading">
        <div className="workspace-overview-copy">
          <p className="workspace-eyebrow">{t("dashboardV013.workspaceState")}</p>
          <h2 id="overview-heading">{t(summary.metrics.trees.ready ? "dashboardV013.readyHeadline" : "dashboardV013.setupHeadline", { count: summary.metrics.trees.ready })}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboardV013.nextStep")}</p>
          <div className="workspace-signals">
            <button onClick={() => navigate("/trees")}><strong>{summary.metrics.trees.ready}<small> / {summary.metrics.trees.total}</small></strong><span>{t("dashboardV013.readyTrees")}</span></button>
            <button onClick={() => navigate("/executions?status=running")}><strong>{summary.metrics.runs.running}</strong><span>{t("dashboardV013.activeExecutions")}</span></button>
            <button onClick={() => navigate("/providers")}><strong>{summary.metrics.providers.usable_models}</strong><span>{t("dashboardUx.readyModels")}</span></button>
          </div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => navigate("/trees")}>{t("dashboardV013.chooseTree")}<ArrowRight className="size-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => navigate("/templates")}>{t("nav.templates")}<ArrowRight className="size-3.5" /></Button></div>
        </div>
        <div className="workspace-architecture" aria-label={t("dashboardV013.architectureLabel")}>
          <svg className="architecture-map" viewBox="0 0 340 152" aria-hidden="true">
            <path className="architecture-links" d="M170 30V45H88V60 M170 45H252V60 M88 88V105H44V122 M88 105H132V122 M252 88V122" />
            <g className="architecture-role architecture-root"><rect x="141" y="2" width="58" height="28" rx="4" /><text x="170" y="16">Root</text></g>
            <g className="architecture-role architecture-manager"><rect x="52" y="60" width="72" height="28" rx="4" /><text x="88" y="74">Manager</text><rect x="216" y="60" width="72" height="28" rx="4" /><text x="252" y="74">Manager</text></g>
            <g className="architecture-role architecture-specialist"><rect x="4" y="122" width="80" height="28" rx="4" /><text x="44" y="136">Specialist</text><rect x="92" y="122" width="80" height="28" rx="4" /><text x="132" y="136">Specialist</text><rect x="208" y="122" width="88" height="28" rx="4" /><text x="252" y="136">Specialist</text></g>
          </svg>
          <p>{t("dashboardV013.architectureNote")}</p>
        </div>
      </section>
      <div className="workspace-columns">
        <div className="workspace-primary">
          <section className="workspace-section" aria-labelledby="recent-heading">
            <SectionHeader id="recent-heading" title={t("dashboard.recentRuns")} detail={t("dashboardV013.executionSummary", { today: summary.metrics.runs.today, completed: summary.metrics.runs.completed, failed: summary.metrics.runs.failed })} action={t("consolidation.viewExecutions")} onClick={() => navigate("/executions")} />
            {summary.recent_runs.length ? <div className="workspace-executions">{summary.recent_runs.map(run => <button key={run.id} onClick={() => navigate(`/executions/${run.id}`)}>
              <Activity className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{run.tree_name}</p><p className="mt-1 text-xs text-muted-foreground"><span className="font-mono">{run.id.slice(0, 8)}</span> · {when(run.started_at, i18n.language)}</p></div><div className="text-right"><RunStatusBadge {...run} /><p className="mt-1 text-xs tabular-nums text-muted-foreground">{run.duration_ms == null ? "—" : `${(run.duration_ms / 1000).toFixed(1)}s`}</p></div><ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>)}</div> : <EmptyState icon={Activity} title={t("dashboard.noRuns")} description={t("dashboard.noRunsHelp")} action={<Button variant="outline" onClick={() => navigate("/trees")}>{t("dashboardV013.chooseTree")}</Button>} />}
            {summary.metrics.runs.success_rate != null && <p className="workspace-footnote">{t("dashboard.successRate")}: {summary.metrics.runs.success_rate}% · {t("dashboardV013.completedAndFailed")}</p>}
          </section>
          <section className="workspace-section" aria-labelledby="trees-heading">
            <SectionHeader id="trees-heading" title={t("dashboard.yourTrees")} detail={t("dashboard.treesHint", { ready: summary.metrics.trees.ready, draft: summary.metrics.trees.draft })} action={t("dashboardV013.allTrees")} onClick={() => navigate("/trees")} />
            {summary.trees.length ? <div className="workspace-tree-list">{summary.trees.map(tree => <article key={tree.id}>
              <Network className="size-4 shrink-0 text-root-agent" /><div className="min-w-0 flex-1"><button className="max-w-full truncate text-left text-sm font-semibold hover:text-primary" onClick={() => navigate(`/trees/${tree.id}`)}>{tree.name}</button><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{tree.description || t("trees.noDescription")}</p><p className="mt-1 text-xs text-muted-foreground">{t("dashboard.agents", { count: tree.agent_count })} · {t("dashboard.runCount", { count: tree.run_count })}</p>{!!tree.provider_summary.length && <p className="mt-1 truncate text-xs text-muted-foreground">{tree.provider_summary.join(" · ")}</p>}</div>
              <div className="workspace-tree-actions"><Badge variant={tree.status === "ready" || tree.status === "published" ? "success" : "secondary"}>{t(`status.${tree.status}`)}</Badge><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => navigate(`/trees/${tree.id}/build`)}>{t("dashboardV013.build")}</Button><Button size="sm" variant="outline" onClick={() => navigate(`/trees/${tree.id}/playground`)}><Play className="size-3" />Playground</Button><Button size="sm" variant="ghost" aria-label={`${t("common.connect")} · ${tree.name}`} onClick={() => navigate(`/trees/${tree.id}?tab=connect`)}>{t("common.connect")}</Button></div></div>
            </article>)}</div> : <EmptyState icon={Network} title={t("dashboard.noTrees")} description={t("dashboard.noTreesHelp")} action={<CreateTreeMenu />} />}
          </section>
        </div>
        <aside className="workspace-rail">
          <section className="workspace-section" aria-labelledby="attention-heading"><SectionHeader id="attention-heading" title={t("dashboard.needsAttention")} detail={t("dashboardV013.attentionCount", { count: summary.needs_attention.length })} />
            {summary.needs_attention.length ? <div className="workspace-attention">{summary.needs_attention.map(item => { const key = `dashboard.attention.${item.kind}`; return <button key={item.id} onClick={() => navigate(item.action_href)}><AlertTriangle className="size-4 shrink-0 text-warning" /><div className="min-w-0"><p className="text-sm font-medium">{i18n.exists(`${key}.title`) ? t(`${key}.title`) : item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{i18n.exists(`${key}.message`) ? t(`${key}.message`, { name: item.resource_name, related: item.related_names.join(", ") }) : item.message}</p></div></button> })}</div> : <p className="workspace-quiet-state"><span className="text-success">✓</span> {t("dashboard.allGood")}<small>{t("dashboard.allGoodHelp")}</small></p>}
          </section>
          <section className="workspace-section" aria-labelledby="providers-heading"><SectionHeader id="providers-heading" title={t("dashboard.providerStatus")} detail={t("dashboardV013.lastChecked")} action={t("common.open")} onClick={() => navigate("/providers")} />
            {summary.providers.length ? summary.providers.map(provider => <button key={provider.id} className="workspace-provider" onClick={() => navigate("/providers")}><div className="min-w-0"><p className="truncate text-sm font-medium">{provider.name}</p><p className="mt-1 text-xs text-muted-foreground">{provider.provider_type.toUpperCase()} · {t("dashboard.modelsReady", { count: provider.usable_models })}</p><p className="mt-1 text-[11px] text-muted-foreground">{when(provider.last_checked_at, i18n.language)}</p></div><Badge variant={provider.status === "connected" ? "success" : provider.status === "error" ? "destructive" : "secondary"}>{t(`status.${provider.status === "not_configured" ? "notConfigured" : provider.status}`)}</Badge></button>) : <EmptyState icon={Sparkles} title={t("dashboard.noProviders")} description={t("dashboard.noProvidersHelp")} action={<Button variant="outline" onClick={() => navigate("/providers")}>{t("dashboard.connectProvider")}</Button>} />}
          </section>
          <section className="workspace-inventory" aria-label={t("dashboard.overview")}><button onClick={() => navigate("/tools")}><span>{t("nav.tools")}</span><strong>{summary.metrics.tools.connected} / {summary.metrics.tools.total}</strong></button><button onClick={() => navigate("/users")}><span>{t("dashboardUx.fullSystem")}</span><strong>{summary.metrics.users}</strong></button><p>{t("dashboardV013.connectedTools")}</p><Button variant="ghost" size="sm" onClick={() => navigate("/users")}>{t("auth.createUser")}</Button></section>
          <GettingStarted />
        </aside>
      </div>
    </>}
  </div>
}

function SectionHeader({ id, title, detail, action, onClick }: { id: string; title: string; detail: string; action?: string; onClick?: () => void }) {
  return <header className="workspace-section-heading"><div className="min-w-0"><h2 id={id}>{title}</h2><p>{detail}</p></div>{action && <Button variant="ghost" size="sm" onClick={onClick}>{action}<ArrowRight className="size-3" /></Button>}</header>
}
