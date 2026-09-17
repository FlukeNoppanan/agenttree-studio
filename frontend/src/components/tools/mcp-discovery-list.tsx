import { Badge } from "@/components/ui/badge"
import type { DiscoveredTool } from "@/lib/api"

export function McpDiscoveryList({ tools, selected, onChange }: { tools: DiscoveredTool[]; selected: string[]; onChange: (selected: string[]) => void }) {
  if (!tools.length) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No MCP Tools discovered yet.</p>
  return <div className="space-y-3">{tools.map((tool) => <label key={tool.name} className="flex cursor-pointer gap-3 rounded-lg border border-border p-4"><input type="checkbox" className="mt-1 accent-primary" checked={selected.includes(tool.name)} onChange={(event) => onChange(event.target.checked ? [...selected, tool.name] : selected.filter((name) => name !== tool.name))} /><div className="min-w-0"><div className="flex items-center gap-2"><p className="font-medium">{tool.name}</p><Badge variant="secondary">MCP Tool</Badge></div><p className="mt-1 text-sm text-muted-foreground">{tool.description || "No description returned"}</p><details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Input schema</summary><pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(tool.input_schema, null, 2)}</pre></details></div></label>)}</div>
}
