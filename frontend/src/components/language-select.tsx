import { useTranslation } from "react-i18next"
import { Select } from "@/components/ui/select"
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
 const { t, i18n } = useTranslation()
 return <Select className={compact ? "h-9 rounded-md py-1 text-xs" : undefined} aria-label={t("settings.language")} value={i18n.language.startsWith("th") ? "th" : "en"} onChange={event => void i18n.changeLanguage(event.target.value)}><option value="en">English</option><option value="th">ไทย</option></Select>
}
