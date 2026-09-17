import { Wrench } from "lucide-react"

import type { WizardAgent } from "@/components/tree/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ToolConnection } from "@/lib/api"

export function ToolUseSettings({ value, tools, onChange }: { value: WizardAgent; tools: ToolConnection[]; onChange: (value: WizardAgent) => void }) {
  const assigned = tools.filter((tool) => value.tool_connection_ids.includes(tool.id) && tool.enabled && tool.status === "connected" && (tool.tool_type !== "mcp" || tool.discovered_tools.some((item) => item.selected)))
  if (!assigned.length) return null
  const update = <K extends keyof WizardAgent>(key: K, next: WizardAgent[K]) => onChange({ ...value, [key]: next })
  return <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-medium"><Wrench className="size-4" />Tool Use</p><p className="mt-1 text-xs text-muted-foreground">Allow this Specialist to choose from its assigned Tools during execution.</p></div><input type="checkbox" checked={value.autonomous_tool_use} onChange={(event) => update("autonomous_tool_use", event.target.checked)} className="mt-1 size-4 accent-primary" aria-label="Allow autonomous Tool use" /></div><div><p className="text-xs font-medium text-muted-foreground">Assigned executable Tools</p><p className="mt-1 text-sm">{assigned.map((tool) => tool.name).join(", ")}</p></div>{value.autonomous_tool_use ? <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Max iterations</Label><Input type="number" min={1} max={10} value={value.max_tool_iterations} onChange={(event) => update("max_tool_iterations", Number(event.target.value))} /></div><div className="space-y-2"><Label>Max Tool calls</Label><Input type="number" min={1} max={10} value={value.max_tool_calls} onChange={(event) => update("max_tool_calls", Number(event.target.value))} /></div><div className="space-y-2"><Label>Loop timeout (seconds)</Label><Input type="number" min={1} max={300} value={value.tool_loop_timeout_seconds} onChange={(event) => update("tool_loop_timeout_seconds", Number(event.target.value))} /></div></div> : null}</div>
}
