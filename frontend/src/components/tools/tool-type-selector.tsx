import { Braces, FilePlus2, RadioTower } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ToolConnection } from "@/lib/api"
import { cn } from "@/lib/utils"

export function ToolTypeSelector({ value, onChange, disabled }: { value: ToolConnection["tool_type"]; onChange: (value: ToolConnection["tool_type"]) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const types = [
    { value: "http_api" as const, label: "HTTP API", detail: "Call a configured HTTP endpoint", icon: Braces },
    { value: "mcp" as const, label: "MCP", detail: "Discover tools from an MCP server", icon: RadioTower },
    { value: "artifact" as const, label: t("treeParity.artifactTool"), detail: t("treeParity.artifactToolHelp"), icon: FilePlus2 },
  ]
  return <div className="grid gap-3 sm:grid-cols-2">{types.map((item) => { const Icon = item.icon; return <button key={item.value} type="button" disabled={disabled} onClick={() => onChange(item.value)} className={cn("rounded-lg border p-4 text-left disabled:cursor-not-allowed disabled:opacity-60", value === item.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30")}><Icon className="size-5" /><p className="mt-2 font-medium">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></button> })}</div>
}
