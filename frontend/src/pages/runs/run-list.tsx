import { Eye, PlaySquare } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Run, type RunStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

const filters: Array<{ label: string; value?: RunStatus }> = [
  { label: "All" }, { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" }, { label: "Running", value: "running" },
]

export function RunListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Run[]>([])
  const [filter, setFilter] = useState<RunStatus | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setLoading(true); api.listRuns({ status: filter }).then(setRuns).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load Runs")).finally(() => setLoading(false)) }, [filter])
  return <div className="space-y-7"><PageHeader title={t("runs.title")} description={t("runs.description")} />{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}<p className="text-xs text-muted-foreground">{t("live.executionsHelp")}</p><div className="studio-tabs">{filters.map((item) => <button key={item.label} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", filter === item.value ? "text-primary" : "text-muted-foreground hover:text-foreground")}>{item.value ? t(`status.${item.value}`) : t("runs.all")}</button>)}</div>{loading ? <Skeleton className="h-72 w-full" /> : runs.length ? <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{t("common.status")}</TableHead><TableHead>{t("runs.tree")}</TableHead><TableHead>{t("designV3.version")}</TableHead><TableHead>{t("runs.started")}</TableHead><TableHead>{t("runs.duration")}</TableHead><TableHead>{t("runs.result")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{runs.map((run) => <TableRow key={run.id}><TableCell><RunStatusBadge status={run.status} /></TableCell><TableCell><p className="font-medium">{run.tree_name}</p><p className="font-mono text-xs text-muted-foreground">{run.id.slice(0, 8)}</p></TableCell><TableCell>v{run.tree_version_number}</TableCell><TableCell>{new Date(run.started_at).toLocaleString(i18n.language)}</TableCell><TableCell>{run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</TableCell><TableCell>{run.output ? run.output.core_status ?? (run.output.success ? t("status.completed") : t("status.failed")) : run.error_code ?? "—"}</TableCell><TableCell><Button variant="ghost" onClick={() => navigate(`/runs/${run.id}`)}><Eye className="size-4" />{t("runs.view")}</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : <EmptyState icon={PlaySquare} title={t("runs.empty")} description={t("runs.emptyHelp")} />}</div>
}
