import { AlertTriangle, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConceptHelp } from "@/components/concept-help"

import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { api, type ProviderConnection, type ProviderModel } from "@/lib/api"
import { isSelectableModel, modelCompatibilityKey, qualificationEvidence, supportsAgentRole } from "@/lib/provider-models"

interface ProviderModelSelectorProps {
  role?: "root" | "manager" | "specialist"
  providers: ProviderConnection[]
  modelCatalogs?: Record<string, ProviderModel[]>
  providerId: string | null
  modelId: string | null
  onProviderChange: (providerId: string | null) => void
  onModelChange: (modelId: string | null) => void
}

export function ProviderModelSelector({ providers, modelCatalogs, providerId, modelId, onProviderChange, onModelChange, role }: ProviderModelSelectorProps) {
  const { t } = useTranslation()
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = providers.find((provider) => provider.id === providerId)
  const connected = providers.filter((provider) => provider.status === "connected")
  const providerOptions = selected && selected.status !== "connected"
    ? [selected, ...connected]
    : connected
  const readyModels = models.filter(isSelectableModel)
  const chosenModel = models.find(item => item.model_id === modelId)
  const evidence = chosenModel ? qualificationEvidence(chosenModel) : null
  const savedModelIsMissing = Boolean(modelId && !readyModels.some((model) => model.model_id === modelId))

  useEffect(() => {
    if (!providerId || selected?.status !== "connected") {
      setModels([])
      setLoading(false)
      setError(null)
      return
    }
    if (modelCatalogs) { setModels(modelCatalogs[providerId] ?? []); setLoading(false); setError(null); return }
    let active = true
    setModels([])
    setLoading(true)
    setError(null)
    api.listModels(providerId, true)
      .then((items) => { if (active) setModels(items) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("builder.modelsFailed")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [providerId, selected?.status, modelCatalogs])

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center gap-1"><Label>{t("uiCopy.providerConnection")}</Label><ConceptHelp concept="provider" /></div>
        <Select aria-label={t("uiCopy.providerConnection")} value={providerId ?? ""} onChange={(event) => onProviderChange(event.target.value || null)}>
          <option value="">{t("uiCopy.selectConnectedProvider")}</option>
          {providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.status !== "connected" ? " (not connected)" : ""}</option>)}
        </Select>
        {providerId && selected?.status !== "connected" ? <p className="flex gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" />{t("uiCopy.thePreviouslySelectedProviderIsNotConnected")}</p> : null}
        {!providerId && connected.length === 0 ? <p className="text-xs text-warning">{t("uiCopy.testAProviderConnectionBeforeAssigningModels")}</p> : null}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1"><Label>{t("uiCopy.model")}</Label><ConceptHelp concept="model" /></div>
        <Select aria-label={t("uiCopy.model")} value={modelId ?? ""} disabled={!providerId || loading || selected?.status !== "connected" || readyModels.length === 0} onChange={(event) => onModelChange(event.target.value || null)}>
          <option value="">{!providerId
            ? t("builder.selectProviderFirst")
            : loading
              ? t("builder.loadingModels")
              : error
                ? t("builder.modelsFailed")
                : readyModels.length === 0
                  ? t("builder.noModels")
                  : t("builder.selectModel")}</option>
          {savedModelIsMissing ? <option value={modelId ?? ""} disabled>{modelId} · {t("trees.modelUnavailable")}</option> : null}
          {readyModels.map((model) => <option key={model.id} value={model.model_id}>{model.display_name ? `${model.display_name} · ${model.model_id}` : model.model_id} · {t(modelCompatibilityKey(model))}</option>)}
        </Select>
        {loading ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />{t("uiCopy.loadingProviderCatalog")}</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {providerId && !loading && selected?.status === "connected" && readyModels.length === 0 && !error ? <p className="text-xs text-muted-foreground">{t("uiCopy.noVerifiedModelsHelp")}</p> : null}
        {savedModelIsMissing && !loading ? <div className="rounded-md border border-warning/25 bg-warning-subtle p-2 text-xs text-warning"><p className="font-medium">{t("trees.modelUnavailable")}</p><p className="mt-1">{t("trees.modelUnavailableHelp")}</p></div> : null}
        {chosenModel && role && !supportsAgentRole(chosenModel, role) && <p role="alert" className="text-xs text-destructive">{t("compatibility.roleBlocked", {role})}</p>}
        {chosenModel?.qualification_status === "limited" && <div role="status" className="rounded-md border border-warning/25 bg-warning-subtle p-2 text-xs"><p className="font-medium text-warning">{t("compatibility.limited")}</p><p className="mt-1">{t(role === "specialist" ? "compatibility.specialistWarning" : role && evidence?.roles[role] === "passed" ? "compatibility.rolePassed" : "compatibility.orchestrationWarning", { role: role ?? "Root / Manager" })}</p>{evidence && <p className="mt-1">{Object.entries(evidence.checks).filter(([, check]) => check.status !== "passed").map(([name, check]) => `${t(`compatibility.checks.${name}`)}: ${t(`compatibility.reasons.${check.reason_code}`, {defaultValue: t("compatibility.checkFailed")})}`).join(" · ")}</p>}<p className="mt-1">{t("compatibility.noFallback")}</p></div>}
      </div>
    </div>
  )
}
