import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { AgentTreeLogoIcon } from "@/components/agenttree-mark"
import { Button } from "@/components/ui/button"

export function RouteError({ onRetry = () => window.location.reload() }: { onRetry?: () => void }) {
  const { t } = useTranslation()
  return <main className="grid min-h-screen place-items-center bg-background px-4 py-12">
    <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-7 shadow-[var(--shadow-lifted)] sm:p-10">
      <div className="flex items-center gap-3 text-primary"><span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><AgentTreeLogoIcon className="size-8" /></span><span className="text-sm font-semibold tracking-tight">AgentTree Studio</span></div>
      <div className="mt-10 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle className="size-6" /></div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{t("errorBoundary.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("errorBoundary.description")}</p>
      <div className="mt-7 flex flex-wrap gap-3"><Button onClick={onRetry}><RotateCcw className="size-4" />{t("errorBoundary.tryAgain")}</Button><Button variant="outline" asChild><Link to="/"><ArrowLeft className="size-4" />{t("errorBoundary.dashboard")}</Link></Button></div>
    </div>
  </main>
}
