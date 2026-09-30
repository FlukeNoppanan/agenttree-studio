import { Check, CircleAlert, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TemplateAgentSetup, TemplateSetupRead } from "@/lib/api"

interface Props {
  data: TemplateSetupRead
  selectedId: string | null
  onSelect: (agent: TemplateAgentSetup) => void
  onAdd: (type: "manager" | "specialist", parentId: string) => void
  adding: boolean
}

export function TemplateTreeCanvas({ data, selectedId, onSelect, onAdd, adding }: Props) {
  const { t } = useTranslation()
  const root = data.agents.find(item => item.agent.agent_type === "root")
  const managers = data.agents.filter(item => item.agent.agent_type === "manager" && item.agent.parent_agent_id === root?.agent.id)
  const requirements = data.tool_requirements
  const providerById = new Map(data.providers.map(item => [item.id, item]))

  function node(item: TemplateAgentSetup) {
    const agent = item.agent
    const issues = data.readiness.validation_issues.filter(issue => issue.agent_id === agent.id)
    const required = requirements.filter(requirement => requirement.agent_id === agent.id && requirement.requirement === "required")
    const unresolved = required.some(requirement => requirement.state !== "ready")
    const provider = providerById.get(agent.provider_connection_id ?? "")
    const model = provider?.models.find(candidate => candidate.model_id === agent.model_id)
    const ready = issues.length === 0 && !unresolved && Boolean(model && agent.capabilities.length && agent.name.trim())
    const status = unresolved ? t("templateWorkspaceV1.needsSetup")
      : issues[0]?.message ?? (!agent.provider_connection_id || !model ? t("templateWorkspaceV1.needsModel") : t("templateWorkspaceV1.ready"))
    return <button
      key={agent.id}
      id={`agent-${item.agent_ref ?? agent.id}`}
      type="button"
      aria-label={`${t(`templatesV3.roles.${agent.agent_type}`)}: ${agent.name}`}
      aria-pressed={selectedId === agent.id}
      onClick={() => onSelect(item)}
      className={`group relative flex w-60 flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedId === agent.id ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t(`templatesV3.roles.${agent.agent_type}`)} {agent.agent_type === "root" ? t("templateWorkspaceV1.agent") : ""}</span>
      <span className="text-base font-semibold leading-tight">{agent.name}</span>
      <span className="truncate text-xs text-muted-foreground">{model ? `${provider?.name} · ${model.display_name || model.model_id}` : t("templateWorkspaceV1.notConfigured")}</span>
      <span className="flex flex-wrap gap-1">
        {required.length ? <Badge variant={unresolved ? "warning" : "success"}>{unresolved ? t("templateWorkspaceV1.toolRequired") : t("templateWorkspaceV1.toolsReady")}</Badge> : null}
        <Badge variant={ready ? "success" : "warning"}>{ready ? <Check className="mr-1 size-3" /> : <CircleAlert className="mr-1 size-3" />}{status}</Badge>
      </span>
    </button>
  }

  if (!root) return <p role="alert">{t("templateSetupV1.loadError")}</p>

  return <section aria-label={t("templateWorkspaceV1.visualTree")} className="overflow-x-auto rounded-xl border border-border bg-muted/20 px-4 py-8 md:px-8">
    <div className="mx-auto flex min-w-max flex-col items-center">
      {node(root)}
      <div className="h-8 border-l-2 border-primary/35" aria-hidden="true" />
      {managers.length ? <div className={`flex items-start gap-6 pt-0 ${managers.length > 1 ? "border-t-2 border-primary/35" : ""}`}>
        {managers.map(manager => {
          const specialists = data.agents.filter(item => item.agent.agent_type === "specialist" && item.agent.parent_agent_id === manager.agent.id)
          return <div key={manager.agent.id} className="flex min-w-60 flex-col items-center">
            <div className="h-6 border-l-2 border-primary/35" aria-hidden="true" />
            {node(manager)}
            <div className="h-7 border-l-2 border-primary/35" aria-hidden="true" />
            <div className="flex items-start gap-3 border-t-2 border-primary/35">
              {specialists.map(specialist => <div key={specialist.agent.id} className="flex flex-col items-center"><div className="h-5 border-l-2 border-primary/35" aria-hidden="true" />{node(specialist)}</div>)}
              <div className="flex flex-col items-center"><div className="h-5 border-l-2 border-primary/35" aria-hidden="true" /><Button size="sm" variant="outline" disabled={adding} onClick={() => onAdd("specialist", manager.agent.id)}><Plus className="size-4" />{t("templateWorkspaceV1.addSpecialist")}</Button></div>
            </div>
          </div>
        })}
      </div> : null}
      <Button className="mt-6" size="sm" variant="outline" disabled={adding} onClick={() => onAdd("manager", root.agent.id)}><Plus className="size-4" />{t("templateWorkspaceV1.addManager")}</Button>
    </div>
  </section>
}
