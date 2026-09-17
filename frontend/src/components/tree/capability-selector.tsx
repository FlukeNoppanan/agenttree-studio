import { AlertCircle, LoaderCircle, Plus, Search, Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  api,
  type AgentType,
  type CapabilityCatalogItem,
  type CapabilitySuggestion,
} from "@/lib/api"

export function normalizeCapability(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100)
}

interface CapabilitySelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  agentType: AgentType
  name: string
  description: string
  systemInstruction: string
  providerConnectionId: string | null
  modelId: string | null
}

export function CapabilitySelector({
  value,
  onChange,
  agentType,
  name,
  description,
  systemInstruction,
  providerConnectionId,
  modelId,
}: CapabilitySelectorProps) {
  const [suggestions, setSuggestions] = useState<CapabilitySuggestion[]>([])
  const [catalog, setCatalog] = useState<CapabilityCatalogItem[]>([])
  const [catalogQuery, setCatalogQuery] = useState("")
  const [custom, setCustom] = useState("")
  const [suggesting, setSuggesting] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setCatalogLoading(true)
      api.listCapabilities(catalogQuery)
        .then((items) => { if (active) setCatalog(items) })
        .catch(() => { if (active) setCatalog([]) })
        .finally(() => { if (active) setCatalogLoading(false) })
    }, 200)
    return () => { active = false; window.clearTimeout(timer) }
  }, [catalogQuery])

  function add(rawValue: string) {
    const normalized = normalizeCapability(rawValue)
    if (!normalized || value.includes(normalized)) return
    onChange([...value, normalized])
  }

  function remove(capability: string) {
    onChange(value.filter((item) => item !== capability))
  }

  async function suggest() {
    if (!providerConnectionId || !modelId || !description.trim()) return
    setSuggesting(true)
    setSuggestionError(null)
    try {
      const response = await api.suggestCapabilities({
        agent_type: agentType,
        name,
        description,
        system_instruction: systemInstruction || null,
        provider_connection_id: providerConnectionId,
        model_id: modelId,
      })
      setSuggestions(response.suggestions)
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Capability suggestion failed")
    } finally {
      setSuggesting(false)
    }
  }

  const canSuggest = Boolean(description.trim() && providerConnectionId && modelId)
  const unselectedSuggestions = suggestions.filter((item) => !value.includes(item.id))
  const unselectedCatalog = catalog.filter((item) => !value.includes(item.id))

  return (
    <div className="space-y-5 rounded-lg border border-border bg-muted/15 p-4">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected</p>
        {value.length ? (
          <div className="flex flex-wrap gap-2">
            {value.map((capability) => (
              <span key={capability} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
                {capability}
                <button type="button" onClick={() => remove(capability)} className="rounded-full hover:bg-primary/10" aria-label={`Remove ${capability}`}><X className="size-3" /></button>
              </span>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No capabilities selected yet.</p>}
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-medium">Suggest from Description</p><p className="mt-0.5 text-xs text-muted-foreground">AI suggestions are optional and are never selected automatically.</p></div>
          <Button type="button" variant="outline" onClick={() => void suggest()} disabled={!canSuggest || suggesting}>
            {suggesting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {suggesting ? "Suggesting…" : suggestionError ? "Retry Suggestions" : "Suggest Capabilities"}
          </Button>
        </div>
        {!description.trim() ? <p className="text-xs text-amber-700 dark:text-amber-300">Add a clear Agent description to enable AI suggestions.</p> : !providerConnectionId || !modelId ? <p className="text-xs text-amber-700 dark:text-amber-300">Select a connected provider and discovered model to enable suggestions.</p> : null}
        {suggestionError ? <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300"><AlertCircle className="size-3.5" />{suggestionError}</div> : null}
        {unselectedSuggestions.length ? <div className="grid gap-2 sm:grid-cols-2">{unselectedSuggestions.map((suggestion) => <button key={suggestion.id} type="button" onClick={() => add(suggestion.id)} className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"><span className="flex items-center gap-1.5 text-sm font-medium"><Plus className="size-3.5 text-primary" />{suggestion.id}</span><span className="mt-1 block text-xs text-muted-foreground">{suggestion.reason}</span></button>)}</div> : suggestions.length ? <p className="text-xs text-muted-foreground">All AI suggestions are selected.</p> : <p className="text-xs text-muted-foreground">No AI suggestions requested yet.</p>}
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div><p className="text-sm font-medium">Existing Capabilities</p><p className="mt-0.5 text-xs text-muted-foreground">Search capabilities already used in saved Trees.</p></div>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search capabilities…" /></div>
        {catalogLoading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Searching catalog</p> : unselectedCatalog.length ? <div className="flex flex-wrap gap-2">{unselectedCatalog.map((item) => <button key={item.id} type="button" onClick={() => add(item.id)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:border-primary/40"><Plus className="size-3" />{item.id}<span className="text-muted-foreground">{item.usage_count}</span></button>)}</div> : <p className="text-xs text-muted-foreground">{catalogQuery ? "No matching saved capabilities." : "The catalog will grow as capabilities are saved to Trees."}</p>}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Custom capability</p>
        <div className="flex gap-2"><Input value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(custom); setCustom("") } }} placeholder="Add custom capability" /><Button type="button" variant="outline" onClick={() => { add(custom); setCustom("") }}><Plus className="size-4" />Add</Button></div>
      </section>
    </div>
  )
}
