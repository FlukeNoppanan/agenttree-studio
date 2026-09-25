import { Bot, GitBranch, Sparkles, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { WizardState } from "@/components/tree/types"

export function TreeStructurePreview({ state }: { state: WizardState }) {
  const { t } = useTranslation()
  return <section aria-label={t("wizardV2.structure")} className="sticky top-6 border-l border-border pl-5">
    <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{t("wizardV2.structure")}</p><p className="mt-1 text-xs text-muted-foreground">{t("wizardV2.structureHelp")}</p></div>
    <div className="space-y-0">
      <div className="rounded-xl border border-primary/25 bg-primary/8 p-3"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Bot className="size-4" />{t("agents.root")}</div><p className="mt-1 truncate font-semibold">{state.root.name || t("agents.root")}</p><p className="mt-1 truncate text-xs text-muted-foreground">{state.root.model_id || t("wizardV2.modelUnassigned")}</p></div>
      {state.managers.length === 0 ? <p className="ml-5 border-l-2 border-dashed border-primary/30 py-4 pl-4 text-xs text-muted-foreground">{t("wizardV2.noManagers")}</p> : state.managers.map(manager => <div key={manager.agent.id} className="ml-5 border-l-2 border-primary/30 pl-4 pt-3">
        <div className="rounded-xl border border-border bg-secondary/50 p-3"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><GitBranch className="size-4" />{t("agents.manager")}</div><p className="mt-1 truncate text-sm font-semibold">{manager.agent.name || t("agents.manager")}</p><p className="mt-1 truncate text-xs text-muted-foreground">{manager.agent.model_id || t("wizardV2.modelUnassigned")}</p></div>
        {manager.specialists.length === 0 ? <p className="ml-4 border-l border-dashed border-border py-3 pl-3 text-xs text-muted-foreground">{t("wizardV2.noSpecialists")}</p> : manager.specialists.map(specialist => <div key={specialist.id} className="ml-4 border-l border-border py-2 pl-3"><div className="rounded-lg border border-border bg-card p-2.5"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5" />{t("agents.specialist")}</div><p className="mt-1 truncate text-sm font-medium">{specialist.name || t("agents.specialist")}</p><p className="mt-1 truncate text-xs text-muted-foreground">{specialist.model_id || t("wizardV2.modelUnassigned")}</p>{specialist.tool_connection_ids.length > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-primary"><Wrench className="size-3" />{t("wizardV2.toolsCount", { count: specialist.tool_connection_ids.length })}</p>}</div></div>)}
      </div>)}
    </div>
  </section>
}
