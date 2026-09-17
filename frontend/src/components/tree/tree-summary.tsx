import { Network, Plug, Wrench } from "lucide-react"

import type { WizardState } from "@/components/tree/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProviderConnection, ToolConnection } from "@/lib/api"

interface TreeSummaryProps {
  state: WizardState
  providers: ProviderConnection[]
  tools: ToolConnection[]
}

export function TreeSummary({ state, providers, tools }: TreeSummaryProps) {
  const agentProviderIds = new Set([
    state.root.provider_connection_id,
    ...state.managers.flatMap((manager) => [
      manager.agent.provider_connection_id,
      ...manager.specialists.map((specialist) => specialist.provider_connection_id),
    ]),
  ].filter(Boolean))
  const usedTools = new Set(state.managers.flatMap((manager) => [
    ...manager.agent.tool_connection_ids,
    ...manager.specialists.flatMap((specialist) => specialist.tool_connection_ids),
  ]))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Network className="size-4" />Agent hierarchy</CardTitle></CardHeader>
        <CardContent>
          <div className="font-mono text-sm leading-7">
            <p>Root · {state.root.name || "Unnamed"}</p>
            {state.managers.length === 0 ? <p className="pl-5 text-muted-foreground">└── No managers</p> : state.managers.map((manager, managerIndex) => (
              <div key={manager.agent.id}>
                <p className="pl-5">{managerIndex === state.managers.length - 1 ? "└──" : "├──"} {manager.agent.name || "Unnamed Manager"}</p>
                {manager.specialists.map((specialist, specialistIndex) => <p key={specialist.id} className="pl-12 text-muted-foreground">{specialistIndex === manager.specialists.length - 1 ? "└──" : "├──"} {specialist.name || "Unnamed Specialist"}{specialist.autonomous_tool_use ? " · autonomous Tools" : ""}</p>)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Providers</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{[...agentProviderIds].length ? providers.filter((provider) => agentProviderIds.has(provider.id)).map((provider) => <p key={provider.id}>{provider.name} <span className="text-muted-foreground">· {provider.status}</span></p>) : <p className="text-muted-foreground">None selected</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="size-4" />Tools</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{[...usedTools].length ? tools.filter((tool) => usedTools.has(tool.id)).map((tool) => <p key={tool.id}>{tool.name}</p>) : <p className="text-muted-foreground">No assignments</p>}</CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plug className="size-4" />Connect after save</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><p>Invoke this reusable Tree with generic JSON and configure Result Destinations from the Tree’s Connect tab.</p></CardContent></Card>
    </div>
  )
}
