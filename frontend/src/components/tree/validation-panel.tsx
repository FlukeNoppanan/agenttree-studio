import { AlertCircle, CircleCheck } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { TreeValidation } from "@/lib/api"

const stepLabels: Record<string, string> = {
  root: "Root Agent",
  managers: "Managers",
  specialists: "Specialists",
  tools: "Tools",
  trigger: "Trigger / Input",
  output: "Output",
  review: "Review",
}

export function ValidationPanel({ validation }: { validation: TreeValidation | null }) {
  const { t, i18n } = useTranslation()
  if (!validation) return (
    <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">{t("validation.prompt")}</div>
  )
  if (validation.valid) return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/8 p-4 text-emerald-800 dark:text-emerald-200"><CircleCheck className="mt-0.5 size-5" /><div><p className="font-medium">{t("validation.ready")}</p><p className="mt-1 text-sm opacity-80">{t("validation.readyHelp")}</p></div></div>
  )
  const groups = validation.errors.reduce<Record<string, typeof validation.errors>>((result, error) => {
    result[error.step] = [...(result[error.step] ?? []), error]
    return result
  }, {})
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
      <div className="mb-4 flex items-center gap-2 text-red-700 dark:text-red-300"><AlertCircle className="size-5" /><p className="font-medium">{t("validation.issues", { count: validation.errors.length })}</p></div>
      <div className="space-y-4">{Object.entries(groups).map(([step, errors]) => <div key={step}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stepLabels[step] ?? step}</p><ul className="mt-1.5 space-y-1 text-sm">{errors.map((error, index) => { const key = `validation.${error.code}`; return <li key={`${error.code}-${index}`}>• {i18n.exists(key) ? t(key) : error.message}</li> })}</ul></div>)}</div>
    </div>
  )
}
