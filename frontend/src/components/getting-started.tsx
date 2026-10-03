import { CreateTreeMenu } from "@/components/create-tree-menu"
import { useEffect, useState } from "react"
import { Check, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/auth"
import { api, type MyDashboard } from "@/lib/api"
import { onboardingPreferences, saveOnboardingPreferences } from "@/lib/onboarding"
import { AgentMentalModel } from "@/components/agent-mental-model"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type Action = "configure" | "run" | "connect"
export function GettingStarted({ expanded = false, summaryOnly = false }: { expanded?: boolean; summaryOnly?: boolean }) {
 const { user, can } = useAuth(); const { t } = useTranslation()
 const [data, setData] = useState<MyDashboard | null>(null)
 const [error, setError] = useState(false); const [loading, setLoading] = useState(true)
 const [refresh, setRefresh] = useState(0); const [understood, setUnderstood] = useState(false)
 const [picker, setPicker] = useState<Action | null>(null)
 useEffect(() => {
  if (!user) return
  let active = true; setLoading(true); setError(false)
  setUnderstood(onboardingPreferences(user.id).understood)
  api.myDashboard().then(value => { if (active) setData(value) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [user?.id, refresh])
 if (!user) return null
 if (loading) return <p role="status" className="text-sm text-muted-foreground">{t("onboarding.loading")}</p>
 if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{t("onboarding.loadError")}</p><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>{t("onboarding.retry")}</Button></div>
 const facts = data?.onboarding
 if (!facts) return null
 const trees = facts.trees
 const granted = new Set(data?.available_trees?.map(tree => tree.id) ?? [])
 const readyTrees = can("use_trees") ? trees.filter(tree => tree.ready && granted.has(tree.id)) : []
 const manage = can("manage_trees_agents"); const viewRuns = can("view_executions")
 const completed = [understood, facts.provider_ready === true, trees.length > 0, trees.some(tree => tree.ready), facts.has_successful_run === true,
  trees.some(tree => tree.ready && onboardingPreferences(user.id).connectedTreeIds.includes(tree.id))]
 const currentStep = completed.findIndex(value => !value)
 const count = completed.filter(Boolean).length
 const progress = <><p className="text-sm text-muted-foreground">{t("revision.progress", { count, total: 6 })}</p><div role="progressbar" aria-label={t("revision.progressLabel")} aria-valuemin={0} aria-valuemax={6} aria-valuenow={count} className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${count / 6 * 100}%` }} /></div></>
 if (!expanded) return <Card aria-label={t("onboarding.title")} className="onboarding-summary min-w-0 border-l-4 border-l-primary"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="text-sm font-semibold">{t("onboarding.title")}</h2>{progress}</div>{!summaryOnly && <Button asChild variant="outline"><Link to="/getting-started">{t("revision.continue")}</Link></Button>}</CardContent></Card>
 function href(action: Action, id: string) { return action === "configure" ? `/trees/${id}/setup` : action === "run" ? `/trees/${id}/playground` : `/trees/${id}?tab=connect` }
 function actionControl(action: Action) {
  const eligible = action === "configure" ? trees : readyTrees
  const permitted = action === "configure" ? manage : action === "run" ? can("use_trees") && viewRuns : manage && can("use_trees")
  if (!permitted) return <p className="text-sm text-muted-foreground">{t(`onboarding.${action}Permission`)}</p>
  if (!eligible.length) return <div className="space-y-3"><p className="text-sm text-muted-foreground">{t(action === "configure" ? "onboarding.createFirst" : "onboarding.readyFirst")}</p>{manage && <Button asChild variant="outline"><Link to={trees.length ? "/trees" : "/templates"}>{t(trees.length ? "onboarding.runsAction" : "onboarding.steps.tree.action")}</Link></Button>}</div>
  if (eligible.length === 1) return <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{t("revision.selectedTree")} <strong>{eligible[0].name}</strong></p><Button asChild><Link to={href(action, eligible[0].id)}>{t(`onboarding.steps.${action}.action`)}</Link></Button></div>
  return <Button onClick={() => setPicker(action)}>{t(action === "configure" ? "revision.chooseTree" : "revision.chooseReady")}</Button>
 }
 const candidates = picker === "configure" ? trees : readyTrees
 function heading(key: string, index: number) { return <div className="flex flex-wrap items-center gap-2"><span className="step-number text-xs font-semibold uppercase tracking-wide text-primary">{t("revision.step", { number: index + 1 })}</span><h2 className="font-semibold">{t(key === "understand" ? "revision.understand" : `onboarding.steps.${key}.title`)}</h2>{completed[index] && <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="size-3" />{t("onboarding.completed")}</span>}</div> }
 return <div className="space-y-5">
  <Card><CardContent className="flex items-center justify-between gap-4 p-4"><div className="flex-1">{progress}</div><Button variant="ghost" size="icon" aria-label={t("onboarding.refresh")} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="size-4" /></Button></CardContent></Card>
  <Card className="tutorial-step" data-state={understood ? "complete" : "current"}><CardHeader>{heading("understand", 0)}<p className="text-sm text-muted-foreground">{t("revision.mentalIntro")}</p></CardHeader><CardContent className="space-y-4"><AgentMentalModel /><div className="grid gap-4 sm:grid-cols-3">{["provider", "model", "tool"].map(term => <div key={term}><h3 className="text-sm font-semibold">{t(`onboarding.terms.${term}.title`)}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`onboarding.terms.${term}.description`)}</p></div>)}</div><Button variant="outline" disabled={understood} onClick={() => { saveOnboardingPreferences(user.id, { understood: true }); setUnderstood(true) }}>{t(understood ? "revision.understood" : "revision.markUnderstood")}</Button></CardContent></Card>
  {(["provider", "tree", "configure", "run", "connect"] as const).map((key, index) => <Card key={key} className="tutorial-step" data-state={completed[index + 1] ? "complete" : currentStep === index + 1 ? "current" : "future"} aria-label={t(`onboarding.steps.${key}.title`)}><CardHeader>{heading(key, index + 1)}<p className="text-sm leading-6 text-muted-foreground">{t(`onboarding.steps.${key}.description`)}</p></CardHeader><CardContent className="space-y-4">
   {key === "provider" ? can("manage_providers_models") ? <Button asChild><Link to="/providers">{t("onboarding.steps.provider.action")}</Link></Button> : <p className="text-sm text-muted-foreground">{t("onboarding.providerPermission")}</p> : key === "tree" ? manage ? <><p className="text-sm text-muted-foreground">{t("onboarding.templatesHelp")}</p><div className="flex flex-wrap gap-2"><Button asChild><Link to="/templates">{t("onboarding.fromTemplate")}</Link></Button><CreateTreeMenu variant="outline" label={t("onboarding.blank")} /></div></> : <><p className="text-sm text-muted-foreground">{t("onboarding.treePermission")}</p>{can("use_trees") && <Button asChild variant="outline"><Link to="/account?section=tree-access">{t("accountV2.tabs.tree-access")}</Link></Button>}</> : actionControl(key)}
   {key === "run" && <><p className="text-sm text-muted-foreground">{t("onboarding.terms.trace.description")}</p>{facts.successful_run_id && viewRuns && <Button asChild variant="outline"><Link to={`/executions/${facts.successful_run_id}`}>{t("onboarding.inspectRun")}</Link></Button>}</>}
   {key === "connect" && <div className="grid gap-3 sm:grid-cols-2">{["apiKey", "webhook"].map(term => <p key={term} className="text-sm text-muted-foreground"><strong className="text-foreground">{t(`onboarding.terms.${term}.title`)}: </strong>{t(`onboarding.terms.${term}.description`)}</p>)}</div>}
  </CardContent></Card>)}
  <Dialog open={picker !== null} onOpenChange={open => { if (!open) setPicker(null) }}><DialogContent><DialogHeader><DialogTitle>{t("revision.picker.title")}</DialogTitle><DialogDescription>{t(`revision.picker.${picker ?? "configure"}`)}</DialogDescription></DialogHeader><div className="space-y-3">{candidates.map(tree => <div key={tree.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{tree.name}</h3><p className="text-xs text-muted-foreground">{t("revision.picker.template")}: {t(`templatesV3.builtins.${tree.template}.name`, { defaultValue: tree.template === "blank" ? t("templatesV3.blank") : tree.template })}</p><p className="text-xs text-muted-foreground">{t(tree.ready ? "status.ready" : "revision.picker.setup")}</p></div><Button asChild><Link to={href(picker ?? "configure", tree.id)} onClick={() => setPicker(null)} aria-label={t("revision.picker.selectNamed", { name: tree.name })}>{t("revision.picker.select")}</Link></Button></div>)}</div></DialogContent></Dialog>
 </div>
}
