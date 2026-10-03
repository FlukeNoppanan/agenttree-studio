import { CircleHelp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState } from "react"

export function ConceptHelp({ concept }: { concept: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return <><Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`${t(`onboarding.terms.${concept}.title`)}: ${t("onboarding.concepts")}`} onClick={() => setOpen(true)}><CircleHelp className="size-3.5" /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t(`onboarding.terms.${concept}.title`)}</DialogTitle><DialogDescription>{t(`onboarding.terms.${concept}.description`)}</DialogDescription></DialogHeader></DialogContent></Dialog></>
}
