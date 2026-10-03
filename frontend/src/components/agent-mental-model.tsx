import { useTranslation } from "react-i18next"
import { ArrowDown } from "lucide-react"
export function AgentMentalModel() {
 const { t } = useTranslation()
 return <ol className="space-y-2" aria-label={t("revision.hierarchy")}>{["root", "manager", "specialist"].map((role, index) => <li key={role}><div data-role={role} className={`workflow-node rounded-lg border border-border border-l-[3px] bg-card p-3 ${role === "root" ? "border-l-root-agent" : role === "manager" ? "border-l-manager-agent" : "border-l-specialist-agent"}`}><h3 className="text-sm font-semibold">{t(`onboarding.terms.${role}.title`)}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`onboarding.terms.${role}.description`)}</p></div>{index < 2 && <ArrowDown aria-hidden="true" className="mx-auto mt-2 size-4 text-primary" />}</li>)}</ol>
}
