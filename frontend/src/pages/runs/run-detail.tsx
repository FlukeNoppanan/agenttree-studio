import { ArrowLeft } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { TraceTimeline } from "@/components/trace-timeline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type RunDetail } from "@/lib/api"

function JsonBlock({ value }: { value: unknown }) { return <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre> }

export function RunDetailPage() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (runId) api.getRun(runId).then(setRun).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load Run")) }, [runId])
  if (!run && !error) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  if (!run) return <div className="space-y-4"><Notice tone="error" message={error ?? "Run not found"} onDismiss={() => setError(null)} /><Button variant="outline" onClick={() => navigate("/runs")}><ArrowLeft className="size-4" />Back to Runs</Button></div>
  const facts = [["Run ID", run.id], ["Tree", run.tree_name], ["Tree Version", `v${run.tree_version_number}`], ["Invocation Source", run.invocation_source], ["Started", new Date(run.started_at).toLocaleString()], ["Finished", run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"], ["Duration", run.duration_ms == null ? "—" : `${run.duration_ms} ms`]]
  return <div className="space-y-7"><div><button className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate("/runs")}><ArrowLeft className="size-3.5" />Runs</button><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">Run {run.id.slice(0, 8)}</h1><RunStatusBadge status={run.status} /></div><p className="mt-2 text-sm text-muted-foreground">AgentTree Core execution plus explicitly labeled Studio Tool-loop activity for {run.tree_name}.</p></div><Card><CardHeader><CardTitle>Overview</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{facts.map(([label, value]) => <div key={label}><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div>)}</CardContent></Card><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Input</CardTitle></CardHeader><CardContent><JsonBlock value={run.input} /></CardContent></Card><Card><CardHeader><CardTitle>Final Result</CardTitle></CardHeader><CardContent>{run.output ? <JsonBlock value={run.output.value} /> : <p className="text-sm text-muted-foreground">No final result was produced.</p>}</CardContent></Card></div>{run.error_message ? <Card className="border-red-500/25"><CardHeader><CardTitle>Errors</CardTitle></CardHeader><CardContent><Notice tone="error" message={`${run.error_code}: ${run.error_message}`} onDismiss={() => undefined} /></CardContent></Card> : null}<Card><CardHeader><CardTitle>Result Deliveries</CardTitle></CardHeader><CardContent className="space-y-2">{run.delivery_results.length ? run.delivery_results.map((delivery) => <div key={delivery.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm"><div><p className="font-medium">{delivery.destination_name}</p><p className="text-xs text-muted-foreground">{delivery.destination_type}</p></div><span className={delivery.status === "success" ? "text-emerald-600" : delivery.status === "failed" ? "text-red-600" : "text-muted-foreground"}>{delivery.status}</span></div>) : <p className="text-sm text-muted-foreground">No delivery outcomes recorded.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Execution Trace</CardTitle></CardHeader><CardContent><TraceTimeline events={run.trace} /></CardContent></Card></div>
}
