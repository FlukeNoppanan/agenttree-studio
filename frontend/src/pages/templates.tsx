import { ArrowRight, Boxes, Eye, Network } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** The persisted Tree template field currently supports only the built-in blank value. */
export function TemplatesPage() {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(false)
  return <div className="space-y-7">
    <PageHeader title={t("nav.templates")} description={t("templatesV3.description")} />
    <Card className="max-w-2xl overflow-hidden"><CardHeader className="bg-secondary/45"><span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Boxes className="size-5" /></span><CardTitle className="mt-3">{t("templatesV3.blank")}</CardTitle><p className="text-sm leading-6 text-muted-foreground">{t("templatesV3.blankHelp")}</p></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPreview(true)}><Eye className="size-4" />{t("templatesV3.inspect")}</Button><Button asChild><Link to="/trees/new"><Network className="size-4" />{t("templatesV3.use")}</Link></Button></CardContent></Card>
    <p className="max-w-2xl text-sm text-muted-foreground">{t("templatesV3.scope")}</p>
    <Dialog open={preview} onOpenChange={setPreview}><DialogContent><DialogHeader><DialogTitle>{t("templatesV3.blank")}</DialogTitle><DialogDescription>{t("templatesV3.blankHelp")}</DialogDescription></DialogHeader><div className="rounded-xl border border-border bg-secondary/35 p-5"><p className="text-sm font-medium">{t("templatesV3.structure")}</p><p className="mt-3 text-sm leading-7 text-muted-foreground">{t("templatesV3.structureHelp")}</p></div><Button asChild><Link to="/trees/new">{t("templatesV3.use")}<ArrowRight className="size-4" /></Link></Button></DialogContent></Dialog>
  </div>
}
