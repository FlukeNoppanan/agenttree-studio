import { CheckCircle2, Database, Languages, RefreshCw, Server, TriangleAlert, Waypoints } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type SystemHealth } from "@/lib/api"

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setHealth(await api.getSystemHealth()) }
    catch { setError(t("errors.network")) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void load() }, [load])

  return <div className="space-y-8">
    <PageHeader title={t("settings.title")} description={t("settings.description")} />
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Languages className="size-5" />{t("settings.language")}</CardTitle><CardDescription>{t("settings.languageHelp")}</CardDescription></CardHeader><CardContent><Select className="max-w-xs" value={i18n.language.startsWith("th") ? "th" : "en"} onChange={(event) => void i18n.changeLanguage(event.target.value)}><option value="en">{t("settings.english")}</option><option value="th">{t("settings.thai")}</option></Select></CardContent></Card>
    <section className="space-y-4" aria-labelledby="health-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="health-heading" className="text-lg font-semibold">{t("settings.systemHealth")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("settings.systemHealthHelp")}</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />{t("settings.refresh")}</Button></div>
      {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {loading ? <Skeleton className="h-64 w-full" /> : health ? <><div className={`flex items-center gap-3 rounded-xl border p-4 ${health.status === "ok" ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>{health.status === "ok" ? <CheckCircle2 className="size-5 text-emerald-600" /> : <TriangleAlert className="size-5 text-amber-600" />}<p className="font-medium">{t(health.status === "ok" ? "settings.healthy" : "settings.degraded")}</p></div><div className="grid gap-4 md:grid-cols-2"><HealthCard icon={Server} title={t("settings.studioApi")} available={health.studio_api.available} detail={`v${health.backend_version}`} /><HealthCard icon={Waypoints} title={t("settings.agenttree")} available={health.agenttree.available} detail={health.agenttree.version ? `v${health.agenttree.version}` : "—"} /><HealthCard icon={Database} title={t("settings.database")} available={health.database.available} detail={health.database.detail ?? "—"} /><HealthCard icon={Database} title={t("settings.migrations")} available={health.migrations.up_to_date} detail={t("settings.currentRevision", { current: health.migrations.current ?? "—", head: health.migrations.head ?? "—" })} /></div><Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3"><Fact label={t("settings.backendVersion")} value={health.backend_version} /><Fact label={t("settings.frontendVersion")} value={health.frontend_version} /><Fact label={t("settings.runtime")} value={`${health.runtime.platform} · Python ${health.runtime.python_version}`} /></CardContent></Card></> : null}
    </section>
  </div>
}

function HealthCard({ icon: Icon, title, available, detail }: { icon: typeof Server; title: string; available: boolean; detail: string }) {
  return <Card><CardContent className="flex items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><Icon className="size-5 text-primary" /><div><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></div><Badge variant={available ? "success" : "destructive"}>{available ? "OK" : "Error"}</Badge></CardContent></Card>
}
function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div> }
