import { useTranslation } from "react-i18next"
import { CapabilitySelector } from "@/components/tree/capability-selector"
import { ProviderModelSelector } from "@/components/tree/provider-model-selector"
import { ToolUseSettings } from "@/components/tree/tool-use-settings"
import type { WizardAgent } from "@/components/tree/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AgentType, ProviderConnection, ToolConnection } from "@/lib/api"

interface AgentFormProps {
  value: WizardAgent
  onChange: (value: WizardAgent) => void
  providers: ProviderConnection[]
  agentType: AgentType
  reviewLabel?: string
  tools?: ToolConnection[]
}

export function AgentForm({ value, onChange, providers, agentType, reviewLabel, tools = [] }: AgentFormProps) {
  const { t } = useTranslation()
  const update = <K extends keyof WizardAgent>(key: K, next: WizardAgent[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="space-y-5">
      <div className="space-y-2"><Label htmlFor={`name-${value.id}`}>{t("agents.name")}</Label><Input id={`name-${value.id}`} value={value.name} onChange={(event) => update("name", event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor={`description-${value.id}`}>{t("agents.description")}</Label><Textarea id={`description-${value.id}`} value={value.description} onChange={(event) => update("description", event.target.value)} placeholder={t("designV3.nameHelp")} /></div>
      <ProviderModelSelector
        providers={providers}
        providerId={value.provider_connection_id}
        modelId={value.model_id}
        onProviderChange={(providerId) => onChange({
          ...value,
          provider_connection_id: providerId,
          model_id: providerId === value.provider_connection_id ? value.model_id : null,
        })}
        onModelChange={(modelId) => update("model_id", modelId)}
      />
      <div className="space-y-2"><Label htmlFor={`instruction-${value.id}`}>{t("agents.systemInstruction")}</Label><Textarea id={`instruction-${value.id}`} value={value.system_instruction} onChange={(event) => update("system_instruction", event.target.value)} placeholder={t("designV3.instructionHelp")} className="min-h-32" /></div>
      <div className="space-y-2"><Label>{t("agents.capabilities")}</Label><CapabilitySelector value={value.capabilities} onChange={(items) => update("capabilities", items)} agentType={agentType} name={value.name} description={value.description} systemInstruction={value.system_instruction} providerConnectionId={value.provider_connection_id} modelId={value.model_id} /><p className="text-xs text-muted-foreground">{t("designV3.capabilityHelp")}</p></div>
      {reviewLabel ? (
        <label className="flex items-center justify-between rounded-lg border border-border bg-muted/25 px-4 py-3">
          <span><span className="block text-sm font-medium">{reviewLabel}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t("designV3.reviewHelp")}</span></span>
          <input type="checkbox" checked={value.review_enabled} onChange={(event) => update("review_enabled", event.target.checked)} className="size-4 accent-primary" />
        </label>
      ) : null}
      {agentType === "specialist" ? <ToolUseSettings value={value} tools={tools} onChange={onChange} /> : null}
    </div>
  )
}
