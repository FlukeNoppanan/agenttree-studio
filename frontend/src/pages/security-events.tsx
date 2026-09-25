import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type SecurityEvent, type SecurityEventPage } from "@/lib/api"

const PAGE_SIZE = 25

export function SecurityEventsPage() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<SecurityEventPage | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [eventType, setEventType] = useState("")
  const [actor, setActor] = useState("")
  const [after, setAfter] = useState("")
  const [before, setBefore] = useState("")
  const [selected, setSelected] = useState<SecurityEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const rangeInvalid = Boolean(after && before && new Date(after) > new Date(before))

  useEffect(() => {
    let active = true
    setLoading(true); setError(false)
    if (rangeInvalid) { setLoading(false); return () => { active = false } }
    void api.listSecurityEvents({ page, page_size: PAGE_SIZE, search: search.trim(), event_type: eventType,
      actor: actor.trim(), after: after ? new Date(after).toISOString() : "", before: before ? new Date(before).toISOString() : "" })
      .then(result => { if (active) setData(result) })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, search, eventType, actor, after, before, rangeInvalid])

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(page * PAGE_SIZE, total)
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  const typeLabel = (type: string) => type === "api_token_created" ? t("auditV2.keyCreated") : type === "api_token_revoked" ? t("auditV2.keyRevoked") : t(`audit.types.${type}`, { defaultValue: type.replaceAll("_", " ") })
  function clearFilters() { setSearch(""); setEventType(""); setActor(""); setAfter(""); setBefore(""); setPage(1) }

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-semibold">{t("audit.title")}</h1><p className="text-muted-foreground">{t("auditV2.description")}</p></div>
    <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1 text-xs font-medium text-muted-foreground">{t("audit.search")}<Input type="search" value={search} placeholder={t("audit.search")} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">{t("audit.event")}<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={eventType} onChange={event => { setEventType(event.target.value); setPage(1) }}><option value="">{t("auditV2.allTypes")}</option>{data?.event_types.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">{t("audit.actor")}<Input value={actor} placeholder={t("auditV2.actorPlaceholder")} onChange={event => { setActor(event.target.value); setPage(1) }} /></label>
      <div className="flex items-end"><Button variant="outline" onClick={clearFilters}>{t("auditV2.clearFilters")}</Button></div>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">{t("auditV2.after")}<Input type="datetime-local" value={after} onChange={event => { setAfter(event.target.value); setPage(1) }} /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">{t("auditV2.before")}<Input type="datetime-local" value={before} onChange={event => { setBefore(event.target.value); setPage(1) }} /></label>
    </div>
    {rangeInvalid && <p role="alert" className="text-destructive">{t("auditV3.rangeError")}</p>}
    {error && <p role="alert" className="text-destructive">{t("audit.loadError")}</p>}
    {loading ? <p role="status" className="text-muted-foreground">{t("audit.loading")}</p> : !error && !rangeInvalid && data && <>
      {data.items.length ? <div className="overflow-x-auto border-y border-border bg-card"><Table><TableHeader><TableRow><TableHead>{t("audit.when")}</TableHead><TableHead>{t("audit.event")}</TableHead><TableHead>{t("audit.actor")}</TableHead><TableHead>{t("audit.subject")}</TableHead></TableRow></TableHeader><TableBody>{data.items.map(event => <TableRow key={event.id}><TableCell className="whitespace-nowrap">{date(event.created_at)}</TableCell><TableCell><Button variant="ghost" className="h-auto justify-start px-0 text-left" onClick={() => setSelected(event)} aria-label={t("auditV2.viewDetails", { type: typeLabel(event.event_type) })}>{typeLabel(event.event_type)}</Button></TableCell><TableCell>{event.actor_username ?? "—"}</TableCell><TableCell className="font-mono text-xs">{event.subject_user_id ?? "—"}</TableCell></TableRow>)}</TableBody></Table></div> : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"><p>{search || eventType || actor || after || before ? t("audit.noMatches") : t("audit.empty")}</p>{(search || eventType || actor || after || before) && <Button variant="outline" className="mt-3" onClick={clearFilters}>{t("auditV2.clearFilters")}</Button>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{t("auditV2.showing", { start, end, total })}</span><div className="flex items-center gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t("auditV2.previous")}</Button><span aria-live="polite">{t("auditV2.pageOf", { page, pages })}</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>{t("auditV2.next")}</Button></div></div>
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="!left-auto !right-0 !top-0 !h-dvh !max-h-dvh !w-full !max-w-md !translate-x-0 !translate-y-0 !rounded-none border-y-0 border-r-0"><DialogHeader><DialogTitle>{t("auditV2.details")}</DialogTitle><DialogDescription>{t("auditV2.detailHelp")}</DialogDescription></DialogHeader>{selected && <dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">{t("audit.when")}</dt><dd>{date(selected.created_at)}</dd></div><div><dt className="text-muted-foreground">{t("audit.event")}</dt><dd>{typeLabel(selected.event_type)}</dd></div><div><dt className="text-muted-foreground">{t("audit.actor")}</dt><dd>{selected.actor_username ?? "—"}</dd></div><div><dt className="text-muted-foreground">{t("audit.subject")}</dt><dd className="break-all font-mono">{selected.subject_user_id ?? "—"}</dd></div><div><dt className="text-muted-foreground">{t("auditV2.eventId")}</dt><dd className="break-all font-mono">{selected.id}</dd></div></dl>}</DialogContent></Dialog>
  </div>
}
