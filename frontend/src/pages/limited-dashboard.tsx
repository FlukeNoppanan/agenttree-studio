import { useEffect, useState } from "react"
import { Network, PlaySquare, Sparkles, Wrench, KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { RunStatusBadge } from "@/components/run-status-badge"
import { GettingStarted } from "@/components/getting-started"
import { CreateTreeMenu } from "@/components/create-tree-menu"
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/auth"
import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"
import { api, type MyDashboard } from "@/lib/api"

export function LimitedDashboard() {
  const { user, can } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState<MyDashboard | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { void api.myDashboard().then(setData).catch(() => setError(t("dashboard.loadError"))) }, [t])
  if (!user) return null
  const metrics = data ? [
    { key: "trees", label: t("dashboard.trees"), value: data.trees_count, icon: Network },
    { key: "providers", label: t("nav.providers"), value: data.providers_count, icon: Sparkles },
    { key: "models", label: t("dashboardUx.readyModels"), value: data.ready_models_count, icon: Sparkles },
    { key: "tools", label: t("nav.tools"), value: data.tools_count, icon: Wrench },
    { key: "runs", label: t("nav.runs"), value: data.runs_count, icon: PlaySquare },
    { key: "secrets", label: t("nav.secrets"), value: data.secrets_count, icon: KeyRound },
  ].filter(item => item.value !== null) : []
  const hasFeature = can("manage_trees_agents") || can("manage_providers_models") || can("manage_tools_mcp") || can("view_executions") || can("manage_secrets") || can("use_trees")
  return <div className="space-y-7">
    <PageHeader title={t("dashboardUx.welcomeBack", { username: user.username })} description={t("dashboardUx.workspace")} />
    <GettingStarted />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!data && !error && <p className="text-muted-foreground">{t("common.loading")}</p>}
    {data && !hasFeature && <section className="min-w-0"><div className="space-y-4 pt-6"><h2 className="text-xl font-semibold">{t("dashboardWelcome.title")}</h2><p>{t("dashboardUx.noResources")}</p><p className="text-muted-foreground">{t("dashboardUx.contactAdmin")}</p><Button onClick={() => navigate("/account")}>{t("accountUx.myAccount")}</Button></div></section>}
    {data && metrics.length > 0 && <div className="metric-strip">{metrics.map(({ key, label, value, icon: Icon }) => <div key={key} className="flex items-center gap-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div><Icon className="size-6 text-primary" /></div>)}</div>}
    {data && can("use_trees") && <section className="min-w-0"><div className="py-4"><CardTitle>{t("accountV2.tabs.tree-access")}</CardTitle></div><div className="space-y-4">{data.available_trees.length ? <div className="resource-list">{data.available_trees.map(tree => <div key={tree.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{tree.name}</p><p className="text-xs text-muted-foreground">{t(`status.${tree.status}`)}</p></div><Button variant="outline" onClick={() => navigate("/account?section=tree-access")}>{t("common.view")}</Button></div>)}</div> : <p className="text-muted-foreground">{t("auth.noAllowedTrees")}</p>}<p className="text-sm text-muted-foreground">{t("dashboardUx.treeAccess", { count: data.available_trees.length })}</p><Button onClick={() => navigate("/account?section=tree-access")}>{t("accountV2.tabs.tree-access")}</Button></div></section>}
    {data && can("view_executions") && <section className="min-w-0"><div className="py-4"><CardTitle>{t("dashboard.recentRuns")}</CardTitle></div><div className="space-y-2">{data.recent_runs.length ? data.recent_runs.map(run => <button key={run.id} className="flex w-full justify-between rounded-lg border p-3 text-left hover:bg-muted" onClick={() => navigate(`/executions/${run.id}`)}><span>{run.tree_name}</span><RunStatusBadge {...run} /></button>) : <p className="text-muted-foreground">{t("dashboard.noRuns")}</p>}</div></section>}
    {data && hasFeature && <section className="min-w-0"><div className="py-4"><CardTitle>{t("dashboard.quickActions")}</CardTitle></div><div className="flex flex-wrap gap-2">{can("manage_trees_agents") && <CreateTreeMenu label={t("dashboard.createTree")} />}{can("manage_providers_models") && <Button onClick={() => navigate("/providers")}>{t("dashboard.connectProvider")}</Button>}{can("manage_tools_mcp") && <Button onClick={() => navigate("/tools")}>{t("dashboard.addTool")}</Button>}{can("view_executions") && <Button variant="outline" onClick={() => navigate("/executions")}>{t("consolidation.viewExecutions")}</Button>}{can("manage_secrets") && <Button variant="outline" onClick={() => navigate("/secrets")}>{t("nav.secrets")}</Button>}{can("use_trees") && <Button variant="outline" onClick={() => navigate("/account?section=api-keys")}>{t("apiKeys.title")}</Button>}</div></section>}
    {data && <section className="min-w-0"><div className="flex items-center justify-between p-5"><p>{t("dashboardUx.signedInAs", { username: user.username })}</p><Button variant="outline" onClick={() => navigate("/account")}>{t("accountUx.myAccount")}</Button></div></section>}
  </div>
}
