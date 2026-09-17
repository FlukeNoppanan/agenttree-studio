import { Activity, ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Run } from "@/lib/api"

export function TraceListPage() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.listRuns().then(setRuns).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load traces")).finally(() => setLoading(false)) }, [])
  return <div className="space-y-7"><PageHeader title="Execution Trace" description="Browse persisted AgentTree traces grouped by Run. Events are shown exactly as Core emitted them." />{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}{loading ? <Skeleton className="h-72 w-full" /> : <div className="space-y-3">{runs.map((run) => <Card key={run.id}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-muted"><Activity className="size-4" /></div><div><p className="font-medium">{run.tree_name} · Run {run.id.slice(0, 8)}</p><p className="mt-1 text-xs text-muted-foreground">Version {run.tree_version_number} · {new Date(run.started_at).toLocaleString()}</p></div></div><div className="flex items-center gap-3"><RunStatusBadge status={run.status} /><Button variant="ghost" onClick={() => navigate(`/runs/${run.id}`)}>Open trace<ArrowRight className="size-4" /></Button></div></CardContent></Card>)}{!runs.length ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No Run traces yet.</p> : null}</div>}</div>
}
