import { Activity, BrainCircuit, ClipboardCheck, Lightbulb, Network, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const capabilities = [
  { key: "experience", icon: Activity },
  { key: "evaluation", icon: ClipboardCheck },
  { key: "patterns", icon: Lightbulb },
  { key: "adaptation", icon: Sparkles },
] as const

const flow = ["runs", "traces", "evaluation", "experience", "patterns", "adaptation", "suggestions"] as const

export function LearningPage() {
  const { t } = useTranslation()
  return <div className="space-y-7">
    <PageHeader title={t("learning.title")} description={t("learning.subtitle")} action={<Badge variant="secondary" className="px-3 py-1.5 text-xs">{t("nav.comingSoon")}</Badge>} />
    <Card className="overflow-hidden"><CardContent className="flex flex-col gap-4 bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:flex-row sm:items-center"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary"><BrainCircuit className="size-7" /></span><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("learning.intro")}</p></CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map(({ key, icon: Icon }) => <Card key={key}><CardHeader><div className="flex items-center justify-between gap-2"><Icon className="size-5 text-primary" /><Badge variant="secondary">{t("nav.comingSoon")}</Badge></div><CardTitle className="pt-2 text-base">{t(`learning.cards.${key}.title`)}</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">{t(`learning.cards.${key}.description`)}</CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Network className="size-5 text-primary" />{t("learning.flowTitle")}</CardTitle></CardHeader><CardContent><ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{flow.map((step, index) => <li key={step} className="relative flex min-h-16 items-center gap-3 rounded-lg border border-border bg-muted/25 p-3 text-sm font-medium"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs text-primary">{index + 1}</span><span>{t(`learning.flow.${step}`)}</span>{index < flow.length - 1 ? <span aria-hidden="true" className="absolute -bottom-3 left-1/2 z-10 text-primary sm:hidden">↓</span> : null}</li>)}</ol><p className="mt-4 text-xs text-muted-foreground">{t("learning.flowNote")}</p></CardContent></Card>
  </div>
}
