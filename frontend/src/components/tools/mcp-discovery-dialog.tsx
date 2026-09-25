import { Braces, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { DiscoveredTool } from "@/lib/api"

interface McpDiscoveryDialogProps {
  connectionName: string
  tools: DiscoveredTool[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SchemaProperty {
  type?: string | string[]
  description?: string
  enum?: unknown[]
  items?: { type?: string }
  anyOf?: Array<{ type?: string }>
}

function propertiesOf(schema: Record<string, unknown>) {
  const properties = schema.properties
  if (!properties || Array.isArray(properties) || typeof properties !== "object") return []
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [])
  return Object.entries(properties as Record<string, SchemaProperty>).map(([name, property]) => ({ name, property, required: required.has(name) }))
}

function propertyType(property: SchemaProperty) {
  if (Array.isArray(property.type)) return property.type.join(" | ")
  if (property.type === "array" && property.items?.type) return `${property.items.type}[]`
  if (property.type) return property.type
  const alternatives = property.anyOf?.flatMap((item) => item.type ? [item.type] : []) ?? []
  return alternatives.length ? alternatives.join(" | ") : "unknown"
}

export function McpDiscoveryDialog({ connectionName, tools, open, onOpenChange }: McpDiscoveryDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  useEffect(() => { if (open) setQuery("") }, [open])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return tools
    return tools.filter((tool) => `${tool.name} ${tool.description} ${JSON.stringify(tool.input_schema)}`.toLocaleLowerCase().includes(normalized))
  }, [query, tools])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden p-0">
      <DialogHeader className="mb-0 border-b border-border px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
        <DialogTitle className="flex items-center gap-2"><Braces className="size-5 text-primary" />{connectionName} · {t("toolUx.mcpTools")}</DialogTitle>
        <DialogDescription>{tools.length === 1 ? t("toolUx.discoveredCountOne") : t("toolUx.discoveredCount", { count: tools.length })}</DialogDescription>
      </DialogHeader>
      <div className="border-b border-border bg-muted/20 px-5 py-4 sm:px-6">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("toolUx.searchTools")} className="pl-9" placeholder={t("toolUx.searchTools")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </div>
      <div data-testid="mcp-discovery-scroll" className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {tools.length === 0 ? <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">{t("toolUx.noToolsDiscovered")}</div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">{t("toolUx.noSearchResults")}</div> : <div className="space-y-3">{filtered.map((tool) => {
          const properties = propertiesOf(tool.input_schema)
          return <article key={tool.name} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-mono text-sm font-semibold text-foreground">{tool.name}</h3><Badge variant="secondary">MCP Tool</Badge></div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{tool.description || t("toolUx.noDescription")}</p>
            <div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("toolUx.inputs")}</p>{properties.length ? <div className="overflow-hidden rounded-lg border border-border">{properties.map(({ name, property, required }) => <div key={name} className="grid gap-1 border-b border-border px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(9rem,1fr)_7rem_6rem_2fr] sm:items-start"><code className="text-xs font-semibold text-foreground">{name}</code><span className="text-xs text-muted-foreground">{propertyType(property)}</span><span className={required ? "text-xs font-medium text-warning" : "text-xs text-muted-foreground"}>{required ? t("toolUx.required") : t("toolUx.optional")}</span><span className="text-xs text-muted-foreground">{property.description || (property.enum ? property.enum.join(" · ") : "—")}</span></div>)}</div> : <p className="rounded-lg bg-muted/45 px-3 py-2 text-xs text-muted-foreground">{t("toolUx.noInputs")}</p>}</div>
            <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-primary">{t("toolUx.viewRawSchema")}</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(tool.input_schema, null, 2)}</pre></details>
          </article>
        })}</div>}
      </div>
      <DialogFooter className="mt-0 border-t border-border bg-card px-5 py-4 sm:px-6"><Button variant="outline" onClick={() => onOpenChange(false)}>{t("toolUx.close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
