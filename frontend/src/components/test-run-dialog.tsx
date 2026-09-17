import { CircleCheck, CircleX, LoaderCircle, Play, ScrollText } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Notice } from "@/components/notice"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, type RunDetail, type TreeDetail } from "@/lib/api"

interface ManualField { id: string; name: string; type: "text" | "textarea" | "number" | "select" | "file"; required?: boolean; options?: string[] }

export function TestRunDialog({ tree, open, onOpenChange, onFinished }: { tree: TreeDetail; open: boolean; onOpenChange: (open: boolean) => void; onFinished?: (run: RunDetail) => void }) {
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<string, string>>({})
  const [jsonInput, setJsonInput] = useState("{}")
  const [mode, setMode] = useState<"json" | "form">("json")
  const [running, setRunning] = useState(false)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fields = useMemo(() => tree.version.trigger?.trigger_type === "manual_form" ? (tree.version.trigger.config.fields as ManualField[] | undefined) ?? [] : [], [tree])

  useEffect(() => {
    if (open) { setRun(null); setError(null); setRunning(false); setStartedAt(null); setMode("json") }
  }, [open])

  async function execute() {
    setError(null)
    let input: Record<string, unknown>
    if (mode === "json") {
      try {
        const parsed: unknown = JSON.parse(jsonInput)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error()
        input = parsed as Record<string, unknown>
      } catch {
        setError("JSON Input must be a valid JSON object.")
        return
      }
    } else {
      input = {}
      for (const field of fields) {
        if (field.type === "file") continue
        const value = values[field.id]
        if (value === undefined || value === "") continue
        input[field.id] = field.type === "number" ? Number(value) : value
      }
    }
    setRunning(true)
    setStartedAt(new Date())
    try {
      const result = await api.invokeTree(tree.id, input, { invoked_from: "studio_test" })
      setRun(result)
      onFinished?.(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Test Run could not start")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="size-5" />Test Run</DialogTitle><DialogDescription>Invoke this reusable Tree with an independent Case or Task payload.</DialogDescription></DialogHeader>
        {running ? <div className="rounded-lg border border-primary/25 bg-primary/5 p-5"><div className="flex items-center gap-3"><LoaderCircle className="size-5 animate-spin text-primary" /><div><p className="font-semibold">Running AgentTree...</p><p className="text-sm text-muted-foreground">{tree.name} · Version {tree.version.version_number}</p></div></div><p className="mt-3 text-xs text-muted-foreground">Started {startedAt?.toLocaleString()}</p></div> : null}
        {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
        {!running && !run ? <div className="space-y-4">
          {fields.length ? <div className="flex gap-2"><Button type="button" className="h-8" variant={mode === "json" ? "default" : "outline"} onClick={() => setMode("json")}>JSON Input</Button><Button type="button" className="h-8" variant={mode === "form" ? "default" : "outline"} onClick={() => setMode("form")}>Friendly Form</Button></div> : null}
          {mode === "json" ? <div className="space-y-2"><Label>JSON Input</Label><Textarea className="min-h-52 font-mono text-xs" value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} placeholder={'{\n  "case_id": "CASE-001",\n  "message": "Investigate connectivity issue"\n}'} /><p className="text-xs text-muted-foreground">Any JSON object is accepted; this does not modify the Tree configuration.</p></div> : fields.map((field) => <div key={field.id} className="space-y-2"><Label>{field.name}{field.required ? " *" : ""}</Label>{field.type === "textarea" ? <Textarea value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} /> : field.type === "select" ? <Select value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}><option value="">Select…</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</Select> : field.type === "file" ? <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">File input is unsupported for Test Run.{field.required ? " This required field prevents form-mode execution." : ""}</div> : <Input type={field.type === "number" ? "number" : "text"} value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} />}</div>)}
        </div> : null}
        {!running && run ? <div className="space-y-4"><div className="flex items-center gap-3">{run.status === "completed" ? <CircleCheck className="size-6 text-emerald-600" /> : <CircleX className="size-6 text-red-600" />}<div><p className="font-semibold">{run.status === "completed" ? "Completed" : "Failed"}</p><RunStatusBadge status={run.status} /></div></div>{run.output ? <div><Label>Final Result</Label><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs">{typeof run.output.value === "string" ? run.output.value : JSON.stringify(run.output.value, null, 2)}</pre></div> : null}{run.error_message ? <Notice tone="error" message={`${run.error_code}: ${run.error_message}`} onDismiss={() => undefined} /> : null}<p className="text-sm text-muted-foreground">Execution time: {run.duration_ms ?? 0} ms</p></div> : null}
        <DialogFooter>{run ? <Button variant="outline" onClick={() => navigate(`/runs/${run.id}`)}><ScrollText className="size-4" />View Trace</Button> : null}<Button variant={run ? "outline" : "default"} disabled={running || (mode === "form" && fields.some((field) => field.type === "file" && field.required))} onClick={() => run ? onOpenChange(false) : void execute()}>{run ? "Close" : running ? "Running…" : "Run AgentTree"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
