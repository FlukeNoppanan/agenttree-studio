import { Eye, PlaySquare } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Run, type RunStatus } from "@/lib/api"
import { runPresentation } from "@/lib/run-presentation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/auth"

const filters: Array<{ label: string; value?: RunStatus }> = [
  { label: "All" }, { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" }, { label: "Running", value: "running" },
]

export function RunListPage() {
  const { can } = useAuth()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Run[]>([])
  const [filter, setFilter] = useState<RunStatus | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setLoading(true); api.listRuns({ status: filter }).then(setRuns).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load Runs")).finally(() => setLoading(false)) }, [filter])
  return <div className="space-y-4"><PageHeader title={t("consolidation.executions")} description={t("consolidation.executionsHelp")} />{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}<div className="studio-tabs">{filters.map((item) => <button key={item.label} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", filter === item.value ? "text-primary" : "text-muted-foreground hover:text-foreground")}>{item.value ? t(`status.${item.value}`) : t("runs.all")}</button>)}</div>{loading ? <Skeleton className="h-72 w-full" /> : runs.length ? <div className="border-y border-border bg-card"><Table><TableHeader><TableRow><TableHead>{t("common.status")}</TableHead><TableHead>{t("runs.tree")}</TableHead><TableHead>Run ID</TableHead><TableHead>{t("designV3.version")}</TableHead><TableHead>{t("runs.started")}</TableHead><TableHead>{t("runs.duration")}</TableHead><TableHead>{t("runs.result")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{runs.map((run) => <TableRow key={run.id}><TableCell><RunStatusBadge {...run} /></TableCell><TableCell><p className="font-medium">{run.tree_name}</p></TableCell><TableCell className="font-mono text-xs"><a href={`/executions/${run.id}`} className="text-primary hover:underline" title={run.id}>{run.id.slice(0, 8)}</a></TableCell><TableCell>v{run.tree_version_number}</TableCell><TableCell className="whitespace-nowrap">{new Date(run.started_at).toLocaleString(i18n.language)}</TableCell><TableCell className="whitespace-nowrap">{run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</TableCell><TableCell>{run.output ? t(runPresentation(run).key) : run.error_code ?? "—"}</TableCell><TableCell><Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => navigate(`/executions/${run.id}`)}><Eye className="size-4" />{t("consolidation.viewExecution")}</Button></TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState icon={PlaySquare} title={t("runs.empty")} description={t("runs.emptyHelp")} action={can("manage_trees_agents") ? <Button onClick={() => navigate("/trees")}>{t("onboarding.runsAction")}</Button> : can("use_trees") ? <Button onClick={() => navigate("/account?section=tree-access")}>{t("accountV2.tabs.tree-access")}</Button> : undefined} />}</div>
}
