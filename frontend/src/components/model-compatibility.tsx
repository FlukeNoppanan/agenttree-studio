import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { isSelectableModel, modelCompatibilityKey, qualificationEvidence, qualificationAttempt } from "@/lib/provider-models"
import type { ProviderModel } from "@/lib/api"

export function ModelCatalog({ models, disabled, onVerify }: { models: ProviderModel[]; disabled?: boolean; onVerify: (model: ProviderModel) => void }) {
  const { t } = useTranslation()
  const [diagnostics, setDiagnostics] = useState(false)
  const selectable = models.filter(isSelectableModel)
  const pending = models.filter(model => ["unknown", "transient_error", "verifying"].includes(model.qualification_status))
  const other = models.filter(model => !isSelectableModel(model) && !pending.includes(model))
  return <><h3 className="font-semibold">{t("compatibility.catalog")} ({selectable.length})</h3><p className="mt-1 text-xs text-muted-foreground">{t("compatibility.catalogHelp")}</p><div className="mt-3 divide-y divide-border">{selectable.map(model => <ModelCompatibility key={model.id} model={model} disabled={disabled} onVerify={() => onVerify(model)} />)}</div>{pending.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm text-primary">{t("qualificationFlow.pendingGroup",{count:pending.length})}</summary>{pending.map(model => <ModelCompatibility key={model.id} model={model} disabled={disabled} onVerify={() => onVerify(model)} />)}</details>}{other.length > 0 && <div className="mt-3"><Button variant="ghost" size="sm" aria-expanded={diagnostics} onClick={() => setDiagnostics(!diagnostics)}>{t("compatibility.otherModels", {count: other.length})}</Button>{diagnostics && <div className="divide-y divide-border">{other.map(model => <ModelCompatibility key={model.id} model={model} disabled={disabled} onVerify={() => onVerify(model)} />)}</div>}</div>}</>
}

export function ModelCompatibility({ model, disabled, onVerify }: { model: ProviderModel; disabled?: boolean; onVerify: () => void }) {
  const { t, i18n } = useTranslation()
  const evidence = qualificationEvidence(model)
  const attempt = qualificationAttempt(model)
  const delayed = Boolean(attempt.retry_at && Date.parse(attempt.retry_at) > Date.now())
  return <div className="py-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{model.display_name || model.model_id.replace(/^models\//, "")}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{model.model_id}</p></div><div className="flex items-center gap-2"><Badge variant={model.qualification_status === "qualified" ? "success" : model.qualification_status === "limited" ? "warning" : "secondary"}>{t(modelCompatibilityKey(model))}</Badge><Button size="sm" variant="outline" disabled={disabled || delayed || model.qualification_status === "verifying" || !model.is_available || !model.generation_candidate} onClick={onVerify}>{t("compatibility.verify")}</Button></div></div>
    <p className="mt-2 text-xs text-muted-foreground">{t(model.qualification_status === "qualified" ? "compatibility.readyHelp" : model.qualification_status === "limited" ? "compatibility.limitedHelp" : "compatibility.unverifiedHelp")}</p>
    {attempt.status === "pending" && <p className="mt-1 text-xs text-warning">{t("qualificationFlow.pendingRecheck")}{attempt.retry_at && ` · ${t("qualificationFlow.retryAt",{time:new Date(attempt.retry_at).toLocaleString(i18n.language)})}`}</p>}
    {model.qualification_checked_at && <p className="mt-1 text-xs text-muted-foreground">{t("compatibility.checked")}: {new Date(model.qualification_checked_at).toLocaleString(i18n.language)}</p>}
    {evidence && <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">{t("compatibility.evidence")}</summary><dl className="mt-2 grid gap-1 sm:grid-cols-2">{Object.entries(evidence.checks).map(([name, check]) => <div key={name}><dt>{t(`compatibility.checks.${name}`)}</dt><dd className={check.status === "passed" ? "text-success" : "text-warning"}>{t(`compatibility.checkStatus.${check.status}`)}{check.reason_code ? ` · ${t(`compatibility.reasons.${check.reason_code}`, {defaultValue: t("compatibility.checkFailed")})}` : ""}</dd>{check.field && <p className="font-mono text-muted-foreground">{check.field}</p>}{check.diagnostics && <details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">{t("compatibility.diagnostics")}</summary><p>{t("compatibility.diagnosticSummary", {count: check.diagnostics.requests.length, mode: check.diagnostics.requests.map(request => request.request_mode).join(" / "), validation: check.diagnostics.validation, repair: check.diagnostics.repair_result})}</p>{check.diagnostics.representation && <p className="font-mono">{check.diagnostics.representation}</p>}</details>}</div>)}</dl><p className="mt-2 text-muted-foreground">{t("compatibility.scope")}</p></details>}
    {model.qualification_error_code && <p className="mt-1 text-xs text-warning">{t(`compatibility.reasons.${model.qualification_error_code}`, {defaultValue: t("compatibility.checkFailed")})}</p>}
  </div>
}
