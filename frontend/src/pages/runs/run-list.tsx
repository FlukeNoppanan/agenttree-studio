import { Eye, PlaySquare, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Notice } from "@/components/notice"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { RunStatusBadge } from "@/components/run-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type TreeListItem } from "@/lib/api"
import { runPresentation } from "@/lib/run-presentation"
import { useAuth } from "@/auth"

const statuses = ["pending", "running", "cancellation_requested", "completed", "failed", "cancelled"]
const PAGE_SIZE = 25
export function localFilterToIso(value: string) {
  return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : ""
}
export function RunListPage() {
  const { can } = useAuth()
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const pendingParams = useRef({ observed: params.toString(), value: new URLSearchParams(params) })
  if (pendingParams.current.observed !== params.toString()) pendingParams.current = { observed: params.toString(), value: new URLSearchParams(params) }
  const [data, setData] = useState<Awaited<ReturnType<typeof api.listRunPage>> | null>(null)
  const [trees, setTrees] = useState<Array<Pick<TreeListItem, "id" | "name">>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const search = params.get("search") ?? ""
  const status = params.get("status") ?? ""
  const tree = params.get("tree_id") ?? ""
  const after = params.get("from") ?? ""
  const before = params.get("to") ?? ""
  const rawPage = Number(params.get("page") ?? 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const invalid = Boolean((after && !localFilterToIso(after)) || (before && !localFilterToIso(before)) || (after && before && new Date(after) > new Date(before)))
  const filtered = Boolean(search || status || tree || after || before)
  const managesTrees = can("manage_trees_agents")
  const usesTrees = can("use_trees")
  useEffect(() => {
    let active = true
    const available = managesTrees ? api.listTrees() : usesTrees ? api.myDashboard().then(value => value.available_trees) : Promise.resolve([])
    available.then(items => { if (active) setTrees(items) }).catch(() => {})
    return () => { active = false }
  }, [managesTrees, usesTrees])
  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    if (invalid) { setLoading(false); return () => { active = false } }
    const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (search.trim()) query.set("search", search.trim())
    if (status) query.set("status", status)
    if (tree) query.set("tree_id", tree)
    if (after) query.set("after", localFilterToIso(after))
    if (before) query.set("before", localFilterToIso(before))
    // Debounce typing, discard stale replies and keep back/refresh state in the URL.
    const timer = window.setTimeout(() => {
      api.listRunPage(query).then(value => { if (active) setData(value) })
        .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : t("liveV2.loadError")) })
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [page, search, status, tree, after, before, invalid, t])
  function update(key: string, value: string) {
    const next = new URLSearchParams(pendingParams.current.value)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== "page") next.delete("page")
    pendingParams.current.value = next
    setParams(next)
  }
  const clear = () => { pendingParams.current.value = new URLSearchParams(); setParams({}) }
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return <div className="operational-page space-y-4">
    <PageHeader title={t("consolidation.executions")} description={t("consolidation.executionsHelp")} />
    <form className="execution-filters" onSubmit={event => event.preventDefault()} aria-label={t("baseline.filters")}>
      <label className="filter-search"><span><Search className="size-3.5" />{t("common.search")}</span><Input type="search" maxLength={160} value={search} placeholder={t("baseline.searchHint")} onChange={event => update("search", event.target.value)} /></label>
      <label><span>{t("common.status")}</span><Select value={status} onChange={event => update("status", event.target.value)}><option value="">{t("runs.all")}</option>{statuses.map(value => <option key={value} value={value}>{t(`status.${value}`)}</option>)}</Select></label>
      <label><span>Tree</span><Select value={tree} onChange={event => update("tree_id", event.target.value)}><option value="">{t("baseline.allTrees")}</option>{trees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
      <label><span>{t("baseline.from")}</span><Input type="datetime-local" value={after} onChange={event => update("from", event.target.value)} /></label>
      <label><span>{t("baseline.to")}</span><Input type="datetime-local" value={before} onChange={event => update("to", event.target.value)} /></label>
      <Button type="button" variant="outline" disabled={!filtered} onClick={clear}>{t("auditV2.clearFilters")}</Button>
    </form>
    <p className="text-xs text-muted-foreground">{t("baseline.localTime")}{filtered && <span className="ml-3 text-primary">{t("baseline.filtersActive")}</span>}</p>
    {invalid && <p role="alert" className="text-sm text-destructive">{t("auditV3.rangeError")}</p>}
    {error && <Notice tone="error" message={error} onDismiss={() => setError(null)} />}
    {loading ? <Skeleton className="h-72 w-full" /> : !error && !invalid && data ? <>
      {data.items.length ? <div className="min-w-0 overflow-x-auto border-y border-border bg-card"><Table><TableHeader><TableRow><TableHead>{t("common.status")}</TableHead><TableHead>Tree / Run ID</TableHead><TableHead>{t("runs.started")}</TableHead><TableHead>{t("runs.duration")}</TableHead><TableHead>{t("runs.result")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{data.items.map(run => <TableRow key={run.id}><TableCell><RunStatusBadge {...run} /></TableCell><TableCell><Link to={`/executions/${run.id}`} className="font-medium text-primary hover:underline">{run.tree_name}</Link><p className="mt-1 font-mono text-[11px] text-muted-foreground" title={run.id}>{run.id.slice(0, 8)} · v{run.tree_version_number}</p></TableCell><TableCell className="whitespace-nowrap">{new Date(run.started_at).toLocaleString(i18n.language)}</TableCell><TableCell>{run.duration_ms == null ? "—" : `${(run.duration_ms / 1000).toFixed(1)}s`}</TableCell><TableCell>{run.output ? t(runPresentation(run).key) : run.error_code ?? "—"}</TableCell><TableCell><Button asChild size="sm" variant="ghost"><Link to={`/executions/${run.id}`} aria-label={`${t("consolidation.viewExecution")} ${run.id.slice(0, 8)}`}><Eye className="size-4" />{t("common.open")}</Link></Button></TableCell></TableRow>)}</TableBody></Table></div> : filtered ? <EmptyState icon={Search} title={t("baseline.noMatches")} description={t("baseline.noMatchesHelp")} action={<Button variant="outline" onClick={clear}>{t("auditV2.clearFilters")}</Button>} /> : <EmptyState icon={PlaySquare} title={t("runs.empty")} description={t("runs.emptyHelp")} action={can("manage_trees_agents") ? <Button asChild><Link to="/trees">{t("onboarding.runsAction")}</Link></Button> : can("use_trees") ? <Button asChild><Link to="/account?section=tree-access">{t("accountV2.tabs.tree-access")}</Link></Button> : undefined} />}
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground" aria-live="polite">{t("auditV2.showing", {start: total && data.items.length ? (page - 1) * PAGE_SIZE + 1 : 0, end: Math.min(page * PAGE_SIZE, total), total})}</p><div className="flex items-center gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => update("page", String(page - 1))}>{t("auditV2.previous")}</Button><span>{t("auditV2.pageOf", {page, pages})}</span><Button variant="outline" disabled={page >= pages} onClick={() => update("page", String(page + 1))}>{t("auditV2.next")}</Button></div></footer>
    </> : null}
  </div>
}
