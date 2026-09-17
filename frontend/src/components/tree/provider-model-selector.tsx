import { AlertTriangle, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { api, type ProviderConnection, type ProviderModel } from "@/lib/api"

interface ProviderModelSelectorProps {
  providers: ProviderConnection[]
  providerId: string | null
  modelId: string | null
  onProviderChange: (providerId: string | null) => void
  onModelChange: (modelId: string | null) => void
}

export function ProviderModelSelector({ providers, providerId, modelId, onProviderChange, onModelChange }: ProviderModelSelectorProps) {
  const { t } = useTranslation()
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = providers.find((provider) => provider.id === providerId)
  const connected = providers.filter((provider) => provider.status === "connected")
  const providerOptions = selected && selected.status !== "connected"
    ? [selected, ...connected]
    : connected
  const savedModelIsMissing = Boolean(modelId && !models.some((model) => model.model_id === modelId))

  useEffect(() => {
    if (!providerId || selected?.status !== "connected") {
      setModels([])
      setLoading(false)
      setError(null)
      return
    }
    let active = true
    setModels([])
    setLoading(true)
    setError(null)
    api.listModels(providerId)
      .then((items) => { if (active) setModels(items) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load models") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [providerId, selected?.status])

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Provider Connection</Label>
        <Select value={providerId ?? ""} onChange={(event) => onProviderChange(event.target.value || null)}>
          <option value="">Select connected provider</option>
          {providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.status !== "connected" ? " (not connected)" : ""}</option>)}
        </Select>
        {providerId && selected?.status !== "connected" ? <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" />The previously selected provider is not connected.</p> : null}
        {!providerId && connected.length === 0 ? <p className="text-xs text-amber-700 dark:text-amber-300">Test a provider connection before assigning models.</p> : null}
      </div>
      <div className="space-y-2">
        <Label>Model</Label>
        <Select value={modelId ?? ""} disabled={!providerId || loading || selected?.status !== "connected" || models.length === 0} onChange={(event) => onModelChange(event.target.value || null)}>
          <option value="">{!providerId
            ? "Select connected provider first"
            : loading
              ? "Loading models…"
              : error
                ? "Unable to load models"
                : models.length === 0
                  ? "No discovered models for this provider"
                  : "Select discovered model"}</option>
          {savedModelIsMissing ? <option value={modelId ?? ""}>{modelId} · {t("trees.modelUnavailable")}</option> : null}
          {models.map((model) => <option key={model.id} value={model.model_id}>{model.display_name ? `${model.display_name} · ${model.model_id}` : model.model_id}</option>)}
        </Select>
        {loading ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Loading provider catalog</p> : null}
        {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        {providerId && !loading && selected?.status === "connected" && models.length === 0 && !error ? <p className="text-xs text-muted-foreground">No verified generation models are ready. Use Discover &amp; Verify Models on the Providers page.</p> : null}
        {savedModelIsMissing && !loading ? <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-200"><p className="font-medium">{t("trees.modelUnavailable")}</p><p className="mt-1">{t("trees.modelUnavailableHelp")}</p></div> : null}
      </div>
    </div>
  )
}
