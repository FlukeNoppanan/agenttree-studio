import { AlertTriangle, Bot, Eye, GitBranch, Wrench } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { AgentTreeMark } from "@/components/agenttree-mark"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { AgentDraft, ProviderConnection, ProviderModel, ToolConnection } from "@/lib/api"

function humanize(value: string) {
  return value.split(/[-_]/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

interface Props {
  agent: AgentDraft
  agents: AgentDraft[]
  providers: ProviderConnection[]
  models: ProviderModel[]
  tools: ToolConnection[]
  assignedToolIds: string[]
  childrenCount: number
}

export function AgentDetails({ agent, agents, providers, models, tools, assignedToolIds, childrenCount }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const provider = providers.find((item) => item.id === agent.provider_connection_id)
  const model = models.find((item) => item.provider_connection_id === agent.provider_connection_id && item.model_id === agent.model_id)
  const assigned = tools.filter((tool) => assignedToolIds.includes(tool.id))
  const parent = agents.find((item) => item.id === agent.parent_agent_id)
  const typeKey = agent.agent_type === "root" ? "root" : agent.agent_type
  const explanation = t(`agents.${typeKey}Help`)
  const settings = agent.settings ?? {}
  const unavailable = Boolean(agent.model_id && (!model || model.qualification_status !== "qualified" || !model.is_available))
  const shell = agent.agent_type === "root"
    ? "border-primary/30 bg-primary/[0.045] shadow-md shadow-primary/5"
    : agent.agent_type === "manager"
      ? "border-manager-agent/45 bg-manager-agent/[0.08]"
      : "border-border bg-card/95"
  const iconShell = agent.agent_type === "root"
    ? "bg-primary text-primary-foreground"
    : agent.agent_type === "manager"
      ? "bg-manager-agent/25 text-primary"
      : "bg-secondary text-secondary-foreground"
  const AgentIcon = agent.agent_type === "manager" ? GitBranch : Bot

  return <>
    <div className={`rounded-2xl border p-4 transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-[var(--shadow-soft)] sm:p-5 ${shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className={`grid size-9 shrink-0 place-items-center rounded-xl ${iconShell}`}>{agent.agent_type === "root" ? <AgentTreeMark className="size-6" /> : <AgentIcon className="size-4" />}</div><div className="min-w-0"><p className="font-semibold tracking-[-0.01em]">{agent.name}</p><p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">{t(`agents.${typeKey}`)}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{agent.description || explanation}</p></div></div><Button className="h-8 px-3" variant="outline" onClick={() => setOpen(true)}><Eye className="size-4" />{t("common.details")}</Button></div>
      <div className="mt-4 grid gap-2 rounded-xl border border-border/70 bg-card/55 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Fact label={t("agents.provider")} value={provider?.name ?? "—"} /><Fact label={t("agents.model")} value={model?.display_name || agent.model_id?.replace(/^models\//, "") || "—"} /><Fact label={t("agents.tools")} value={t("agents.toolsConnected", { count: assigned.length })} /><Fact label={t("agents.autonomous")} value={settings.autonomous_tool_use ? t("common.enabled") : t("common.disabled")} /></div>
      <div className="mt-3 flex flex-wrap gap-1">{agent.capabilities.length ? agent.capabilities.map((capability) => <Badge key={capability} variant="secondary">{humanize(capability)}</Badge>) : <span className="text-xs text-muted-foreground">{t("agents.noCapabilities")}</span>}</div>
      {unavailable ? <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><div><p className="font-medium">{t("trees.modelUnavailable")}</p><p className="mt-1 text-xs text-muted-foreground">{t("trees.modelUnavailableHelp")}</p></div></div> : null}
    </div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{agent.name}</DialogTitle><DialogDescription>{explanation}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Fact label={t("agents.type")} value={t(`agents.${typeKey}`)} /><Fact label={t("agents.provider")} value={provider?.name ?? "—"} /><Fact label={t("agents.model")} value={model?.display_name || agent.model_id || "—"} /><Fact label={agent.agent_type === "root" ? t("agents.managersCount") : agent.agent_type === "manager" ? t("agents.specialistsCount") : t("agents.parentManager")} value={agent.agent_type === "specialist" ? parent?.name ?? "—" : String(childrenCount)} /></div><Detail label={t("agents.description")} value={agent.description || "—"} /><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("agents.capabilities")}</p><div className="mt-2 flex flex-wrap gap-1">{agent.capabilities.map((capability) => <Badge key={capability} variant="secondary">{humanize(capability)}</Badge>)}</div></div><Detail label={t("agents.systemInstruction")} value={agent.system_instruction || t("agents.noInstruction")} />{agent.agent_type === "specialist" ? <div className="space-y-3 rounded-lg border border-border p-4"><p className="flex items-center gap-2 font-medium"><Wrench className="size-4" />{t("agents.assignedTools")}</p><p className="text-sm text-muted-foreground">{assigned.length ? assigned.map((tool) => tool.name).join(", ") : t("common.none")}</p><div className="grid gap-3 sm:grid-cols-2"><Fact label={t("agents.autonomous")} value={settings.autonomous_tool_use ? t("common.enabled") : t("common.disabled")} /><Fact label={t("agents.maxIterations")} value={String(settings.max_tool_iterations ?? 5)} /><Fact label={t("agents.maxCalls")} value={String(settings.max_tool_calls ?? 5)} /><Fact label={t("agents.timeout")} value={`${String(settings.tool_loop_timeout_seconds ?? 60)} s`} /></div></div> : null}</DialogContent></Dialog>
  </>
}

function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div> }
function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">{value}</p></div> }
