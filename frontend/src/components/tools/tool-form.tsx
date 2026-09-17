import { ArrowLeft, ArrowRight, LoaderCircle, Save } from "lucide-react"
import { useEffect, useState } from "react"

import { Notice } from "@/components/notice"
import { HttpToolConfig, type HttpConfigState } from "@/components/tools/http-tool-config"
import { McpDiscoveryList } from "@/components/tools/mcp-discovery-list"
import { McpToolConfig, type McpConfigState } from "@/components/tools/mcp-tool-config"
import { ToolAssignmentSelector, type EligibleSpecialist } from "@/components/tools/tool-assignment-selector"
import { ToolTypeSelector } from "@/components/tools/tool-type-selector"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, type Secret, type ToolConnection, type ToolPayload } from "@/lib/api"

const steps = ["General", "Connection", "Schema / Discovery", "Assignments", "Review / Test"]
const defaultHttp: HttpConfigState = { method: "GET", url: "", headers: "{}", query: "{}", inputSchema: '{\n  "type": "object",\n  "properties": {}\n}', outputHandling: "json", timeout: "30", testArguments: "{}" }
const defaultMcp: McpConfigState = { transport: "stdio", url: "", command: "", args: "[]", headers: "{}", env: "{}", cwd: "", timeout: "30" }

function jsonValue(text: string, label: string, expected: "object" | "array") {
  const value: unknown = JSON.parse(text)
  if ((expected === "array" && !Array.isArray(value)) || (expected === "object" && (!value || Array.isArray(value) || typeof value !== "object"))) throw new Error(`${label} must be valid JSON ${expected}`)
  return value
}

function statesFromTool(tool: ToolConnection | null) {
  const config = tool?.configuration ?? {}
  const http: HttpConfigState = tool?.tool_type === "http_api" ? {
    method: String(config.method ?? "GET"), url: String(config.url ?? ""), headers: JSON.stringify(config.headers ?? {}, null, 2), query: JSON.stringify(config.query ?? {}, null, 2), inputSchema: JSON.stringify(config.input_schema ?? { type: "object", properties: {} }, null, 2), outputHandling: String(config.output_handling ?? "json"), timeout: String(config.timeout ?? 30), testArguments: JSON.stringify(config.test_arguments ?? {}, null, 2),
  } : defaultHttp
  const mcp: McpConfigState = tool?.tool_type === "mcp" ? {
    transport: tool.transport_type ?? "stdio", url: String(config.url ?? ""), command: String(config.command ?? ""), args: JSON.stringify(config.args ?? [], null, 2), headers: JSON.stringify(config.headers ?? {}, null, 2), env: JSON.stringify(config.env ?? {}, null, 2), cwd: String(config.cwd ?? ""), timeout: String(config.timeout ?? 30),
  } : defaultMcp
  return { http, mcp }
}

export function ToolForm({ open, onOpenChange, tool, secrets, specialists, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; tool: ToolConnection | null; secrets: Secret[]; specialists: EligibleSpecialist[]; onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState<ToolConnection | null>(tool)
  const [name, setName] = useState(tool?.name ?? "")
  const [description, setDescription] = useState(tool?.description ?? "")
  const [type, setType] = useState<ToolConnection["tool_type"]>(tool?.tool_type ?? "http_api")
  const [enabled, setEnabled] = useState(tool?.enabled ?? true)
  const [secretId, setSecretId] = useState(tool?.secret_id ?? "")
  const initial = statesFromTool(tool)
  const [http, setHttp] = useState(initial.http)
  const [mcp, setMcp] = useState(initial.mcp)
  const [discovered, setDiscovered] = useState(tool?.discovered_tools ?? [])
  const [selectedTools, setSelectedTools] = useState(tool?.discovered_tools.filter((item) => item.selected).map((item) => item.name) ?? [])
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const values = statesFromTool(tool)
    setStep(0); setSaved(tool); setName(tool?.name ?? ""); setDescription(tool?.description ?? ""); setType(tool?.tool_type ?? "http_api"); setEnabled(tool?.enabled ?? true); setSecretId(tool?.secret_id ?? ""); setHttp(values.http); setMcp(values.mcp); setDiscovered(tool?.discovered_tools ?? []); setSelectedTools(tool?.discovered_tools.filter((item) => item.selected).map((item) => item.name) ?? []); setSelectedAgents([]); setError(null)
    if (tool) api.getToolAssignments(tool.id).then((result) => setSelectedAgents(result.assignments.map((item) => item.agent_id))).catch(() => undefined)
  }, [open, tool])

  function configuration(): Record<string, unknown> {
    if (type === "http_api") return { method: http.method, url: http.url, headers: jsonValue(http.headers, "Headers", "object"), query: jsonValue(http.query, "Query", "object"), input_schema: jsonValue(http.inputSchema, "Input schema", "object"), output_handling: http.outputHandling, timeout: Number(http.timeout), test_arguments: jsonValue(http.testArguments, "Test arguments", "object") }
    return mcp.transport === "stdio" ? { command: mcp.command, args: jsonValue(mcp.args, "Arguments", "array"), env: jsonValue(mcp.env, "Environment", "object"), cwd: mcp.cwd || null, timeout: Number(mcp.timeout) } : { url: mcp.url, headers: jsonValue(mcp.headers, "Headers", "object"), timeout: Number(mcp.timeout) }
  }

  async function persist() {
    if (!name.trim()) throw new Error("Tool name is required")
    const payload: ToolPayload = { name: name.trim(), description: description.trim(), tool_type: type, enabled, secret_id: secretId || null, transport_type: type === "mcp" ? mcp.transport : null, configuration: configuration() }
    const result = saved ? await api.updateTool(saved.id, { ...payload, selected_tools: type === "mcp" ? selectedTools : undefined }) : await api.createTool(payload)
    setSaved(result); setDiscovered(result.discovered_tools)
    return result
  }

  async function next() {
    setError(null)
    if (step === 0) { if (!name.trim()) { setError("Enter a Tool name."); return } setStep(1); return }
    setBusy(true)
    try {
      let current = saved
      if (step === 1 || step === 2) current = await persist()
      if (step === 1 && type === "mcp" && current) {
        const result = await api.discoverTool(current.id)
        setSaved(result.tool); setDiscovered(result.tools); setSelectedTools(result.tools.filter((item) => item.selected).map((item) => item.name))
      }
      setStep((value) => Math.min(steps.length - 1, value + 1))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save Tool configuration") }
    finally { setBusy(false) }
  }

  async function finish() {
    setBusy(true); setError(null)
    try {
      let current = await persist()
      if (enabled) {
        const tested = await api.testTool(current.id)
        current = tested.tool
        if (current.status !== "connected") throw new Error(tested.message)
        if (type === "mcp" && !selectedTools.length && selectedAgents.length) throw new Error("Select at least one discovered MCP Tool before assigning Agents.")
        await api.updateToolAssignments(current.id, selectedAgents)
      } else {
        await api.updateToolAssignments(current.id, [])
      }
      onComplete(); onOpenChange(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to complete Tool setup") }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen) }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{tool ? "Edit Tool" : "Add Tool"}</DialogTitle><DialogDescription>Configure an explicit executable Tool. This does not enable autonomous model tool planning.</DialogDescription></DialogHeader><div className="mb-5 flex gap-1 overflow-x-auto">{steps.map((label, index) => <div key={label} className={`whitespace-nowrap rounded px-2 py-1 text-xs ${index === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}. {label}</div>)}</div>{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}<div className="min-h-80 py-2">{step === 0 ? <div className="space-y-5"><div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></div><ToolTypeSelector value={type} onChange={setType} disabled={Boolean(saved)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-primary" />Enabled</label></div> : null}{step === 1 ? <div className="space-y-5">{type === "http_api" ? <HttpToolConfig value={http} onChange={setHttp} /> : <McpToolConfig value={mcp} onChange={setMcp} />}<div className="space-y-2"><Label>Credential Secret</Label><Select value={secretId} onChange={(event) => setSecretId(event.target.value)}><option value="">No Secret</option>{secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name}</option>)}</Select></div></div> : null}{step === 2 ? type === "mcp" ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Select the individual MCP Tools to import into the runtime registry.</p><McpDiscoveryList tools={discovered} selected={selectedTools} onChange={setSelectedTools} /></div> : <div className="space-y-3"><p className="font-medium">HTTP Tool schema</p><p className="text-sm text-muted-foreground">The configured JSON Schema becomes Core’s ToolInputSpec. URL and query placeholders consume matching arguments; remaining arguments become query parameters or a JSON body.</p><pre className="max-h-64 overflow-auto rounded-lg bg-muted p-4 text-xs">{http.inputSchema}</pre></div> : null}{step === 3 ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Core authorizes explicit Tool execution for Specialist Agents only.</p><ToolAssignmentSelector specialists={specialists} selected={selectedAgents} onChange={setSelectedAgents} /></div> : null}{step === 4 ? <div className="space-y-4 rounded-lg border border-border p-5"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Tool</p><p className="mt-1 font-semibold">{name}</p></div><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Type</p><p>{type === "http_api" ? "HTTP API" : "MCP"}</p></div><div><p className="text-xs text-muted-foreground">Imported MCP Tools</p><p>{type === "mcp" ? selectedTools.length : "—"}</p></div><div><p className="text-xs text-muted-foreground">Specialist assignments</p><p>{selectedAgents.length}</p></div></div><p className="text-sm text-muted-foreground">Finish saves the configuration, tests the real connection, and applies authorized Specialist bindings.</p></div> : null}</div><DialogFooter><Button variant="outline" disabled={busy || step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="size-4" />Back</Button>{step < steps.length - 1 ? <Button disabled={busy} onClick={() => void next()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Next</Button> : <Button disabled={busy} onClick={() => void finish()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save & Test</Button>}</DialogFooter></DialogContent></Dialog>
}
