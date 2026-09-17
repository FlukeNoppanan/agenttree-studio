import { LoaderCircle, Play } from "lucide-react"
import { useEffect, useState } from "react"

import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, type ToolConnection, type ToolExecution } from "@/lib/api"

export function ToolTestDialog({ tool, open, onOpenChange }: { tool: ToolConnection | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [argumentsText, setArgumentsText] = useState("{}")
  const [toolName, setToolName] = useState("")
  const [result, setResult] = useState<ToolExecution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setArgumentsText("{}"); setResult(null); setError(null); setToolName(tool?.discovered_tools.find((item) => item.selected)?.name ?? "") } }, [open, tool])
  async function execute() {
    if (!tool) return
    setBusy(true); setError(null)
    try {
      const parsed: unknown = JSON.parse(argumentsText)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Arguments must be a JSON object")
      setResult(await api.executeTool(tool.id, { arguments: parsed as Record<string, unknown>, ...(tool.tool_type === "mcp" ? { tool_name: toolName } : {}) }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Tool execution failed") }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value) }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="size-5" />Test Execute {tool?.name}</DialogTitle></DialogHeader>{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}<div className="space-y-4">{tool?.tool_type === "mcp" ? <div className="space-y-2"><Label>Discovered MCP Tool</Label><Select value={toolName} onChange={(event) => setToolName(event.target.value)}><option value="">Select…</option>{tool.discovered_tools.map((item) => <option key={item.name} value={item.name}>{item.name}{item.selected ? " · imported" : ""}</option>)}</Select></div> : null}<div className="space-y-2"><Label>Arguments JSON</Label><Textarea className="min-h-40 font-mono text-xs" value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} /></div>{result ? <div className="space-y-3"><Notice tone={result.success ? "success" : "error"} message={result.success ? "Tool execution completed" : result.error ?? "Tool execution failed"} onDismiss={() => undefined} /><div><Label>Result</Label><pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(result.output, null, 2)}</pre></div><details><summary className="cursor-pointer text-sm text-muted-foreground">Core ToolExecutor trace ({result.trace.length} events)</summary><pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(result.trace, null, 2)}</pre></details></div> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={busy || (tool?.tool_type === "mcp" && !toolName)} onClick={() => void execute()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}Execute</Button></DialogFooter></DialogContent></Dialog>
}
