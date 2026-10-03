import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/auth"
import { LanguageSelect } from "@/components/language-select"
import { AgentMentalModel } from "@/components/agent-mental-model"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { snoozeWelcome, welcomeSuppressed, type WelcomeSnooze } from "@/lib/welcome"
export function WelcomeDialog() {
 const { user } = useAuth(); const { t } = useTranslation(); const navigate = useNavigate()
 const [open, setOpen] = useState(false); const [choice, setChoice] = useState<WelcomeSnooze | "">("")
 useEffect(() => { setChoice(""); setOpen(Boolean(user && !welcomeSuppressed(user.id))) }, [user?.id])
 function dismiss(path?: string) {
  if (user && choice) snoozeWelcome(user.id, choice)
  setOpen(false); if (path) navigate(path)
 }
 return <Dialog open={open} onOpenChange={value => { if (!value) dismiss() }}><DialogContent className="max-w-xl"><div className="mb-4 ml-auto mr-8 w-36"><LanguageSelect /></div><DialogHeader><DialogTitle className="text-xl">{t("revision.welcome.title")}</DialogTitle><DialogDescription>{t("revision.welcome.description")}</DialogDescription></DialogHeader><AgentMentalModel /><p className="my-4 text-sm text-muted-foreground">{t("revision.welcome.guide")}</p><div className="space-y-2"><Label htmlFor="welcome-snooze">{t("revision.welcome.snooze")}</Label><Select id="welcome-snooze" value={choice} onChange={event => setChoice(event.target.value as WelcomeSnooze | "")}><option value="">{t("revision.welcome.nextEntry")}</option>{["session", "today", "3", "7", "14"].map(value => <option key={value} value={value}>{t(`revision.welcome.options.${value}`)}</option>)}</Select><p className="text-xs text-muted-foreground">{t("revision.welcome.snoozeHelp")}</p></div><DialogFooter className="flex-wrap"><Button variant="outline" onClick={() => dismiss("/")}>{t("revision.welcome.dashboard")}</Button><Button onClick={() => dismiss("/getting-started")}>{t("revision.welcome.start")}</Button></DialogFooter></DialogContent></Dialog>
}
