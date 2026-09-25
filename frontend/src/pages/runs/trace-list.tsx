import { useTranslation } from "react-i18next"
import { Activity, ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Run } from "@/lib/api"

export function TraceListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.listRuns().then(setRuns).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load traces")).finally(() => setLoading(false)) }, [])
  return <div className="space-y-7"><PageHeader title={t("nav.trace")} description={t("runs.description")} />{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}{loading ? <Skeleton className="h-72 w-full" /> : <div className="resource-list">{runs.map((run) => <article key={run.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-muted"><Activity className="size-4" /></div><div><p className="font-medium">{run.tree_name} · Run {run.id.slice(0, 8)}</p><p className="mt-1 text-xs text-muted-foreground">{t("designV3.version")} {run.tree_version_number} · {new Date(run.started_at).toLocaleString(i18n.language)}</p></div></div><div className="flex items-center gap-3"><RunStatusBadge status={run.status} /><Button variant="ghost" onClick={() => navigate(`/runs/${run.id}`)}>{t("live.inspect")}<ArrowRight className="size-4" /></Button></div></article>)}{!runs.length ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("live.noActivity")}</p> : null}</div>}</div>
}
