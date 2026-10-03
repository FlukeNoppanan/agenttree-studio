import { useTranslation } from "react-i18next"
import { GettingStarted } from "@/components/getting-started"
import { PageHeader } from "@/components/page-header"
export function GettingStartedPage() {
 const { t } = useTranslation()
 return <div className="space-y-7"><PageHeader title={t("revision.tutorialTitle")} description={t("revision.tutorialDescription")} /><GettingStarted expanded /></div>
}
