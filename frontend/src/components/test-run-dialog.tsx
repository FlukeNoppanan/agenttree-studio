import { useTranslation } from "react-i18next"
import { LoaderCircle, Play, ScrollText } from "lucide-react"
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
  const { t, i18n } = useTranslation()

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
        setError(t("uiCopy.jsonInputMustBeAValidJsonObject"))
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
      setError(caught instanceof Error ? caught.message : t("uiCopy.testRunCouldNotStart"))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="size-5" />{t("uiCopy.testRun")}</DialogTitle><DialogDescription>{t("uiCopy.invokeThisReusableTreeWithAnIndependentCaseOrTaskPayload")}</DialogDescription></DialogHeader>
        {running ? <div className="rounded-lg border border-primary/25 bg-primary/5 p-5"><div className="flex items-center gap-3"><LoaderCircle className="size-5 animate-spin text-primary" /><div><p className="font-semibold">{t("uiCopy.runningAgenttree")}</p><p className="text-sm text-muted-foreground">{tree.name} · Version {tree.version.version_number}</p></div></div><p className="mt-3 text-xs text-muted-foreground">Started {startedAt?.toLocaleString(i18n.language)}</p></div> : null}
        {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
        {!running && !run ? <div className="space-y-4">
          {fields.length ? <div className="flex gap-2"><Button type="button" className="h-8" variant={mode === "json" ? "default" : "outline"} onClick={() => setMode("json")}>{t("uiCopy.jsonInput")}</Button><Button type="button" className="h-8" variant={mode === "form" ? "default" : "outline"} onClick={() => setMode("form")}>{t("uiCopy.friendlyForm")}</Button></div> : null}
          {mode === "json" ? <div className="space-y-2"><Label>{t("uiCopy.jsonInput")}</Label><Textarea className="min-h-52 font-mono text-xs" value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} placeholder={'{\n  "case_id": "CASE-001",\n  "message": "Investigate connectivity issue"\n}'} /><p className="text-xs text-muted-foreground">{t("uiCopy.anyJsonObjectIsAcceptedThisDoesNotModifyTheTreeConfiguration")}</p></div> : fields.map((field) => <div key={field.id} className="space-y-2"><Label>{field.name}{field.required ? " *" : ""}</Label>{field.type === "textarea" ? <Textarea value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} /> : field.type === "select" ? <Select value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}><option value="">{t("uiCopy.select")}</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</Select> : field.type === "file" ? <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{t("uiCopy.fileInputIsUnsupportedForTestRun")}{field.required ? t("uiCopy.thisRequiredFieldPreventsFormModeExecution") : ""}</div> : <Input type={field.type === "number" ? "number" : "text"} value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} />}</div>)}
        </div> : null}
        {!running && run ? <div className="space-y-4"><RunStatusBadge {...run} />{run.output ? <div><Label>{t("uiCopy.finalResult")}</Label><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs">{typeof run.output.value === "string" ? run.output.value : JSON.stringify(run.output.value, null, 2)}</pre></div> : null}{run.error_message ? <Notice tone="error" message={`${run.error_code}: ${run.error_message}`} onDismiss={() => undefined} /> : null}<p className="text-sm text-muted-foreground">{t("uiCopy.executionTime") + " "}{run.duration_ms ?? 0} ms</p></div> : null}
        <DialogFooter>{run ? <Button variant="outline" onClick={() => navigate(`/executions/${run.id}`)}><ScrollText className="size-4" />{t("uiCopy.viewTrace")}</Button> : null}<Button variant={run ? "outline" : "default"} disabled={running || (mode === "form" && fields.some((field) => field.type === "file" && field.required))} onClick={() => run ? onOpenChange(false) : void execute()}>{run ? t("uiCopy.close") : running ? t("uiCopy.running") : t("uiCopy.runAgenttree")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
