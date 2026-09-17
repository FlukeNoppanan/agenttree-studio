import { Eye, Network, Pencil, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/empty-state"
import { AgentTreeMark } from "@/components/agenttree-mark"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type TreeListItem } from "@/lib/api"

function statusVariant(status: TreeListItem["status"]): "success" | "secondary" | "warning" | "default" {
  if (status === "ready" || status === "published") return "success"
  if (status === "paused") return "warning"
  if (status === "draft" || status === "archived") return "secondary"
  return "default"
}

export function TreeListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [trees, setTrees] = useState<TreeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTrees(await api.listTrees()) }
    catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load Trees" }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function remove(tree: TreeListItem) {
    if (!window.confirm(`Delete “${tree.name}” and all of its versions?`)) return
    try {
      await api.deleteTree(tree.id)
      setTrees((items) => items.filter((item) => item.id !== tree.id))
      setNotice({ tone: "success", message: "Tree deleted." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete Tree" })
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t("trees.title")} description={t("trees.description")} action={<Button onClick={() => navigate("/trees/new")}><Plus className="size-4" />{t("trees.create")}</Button>} />
      {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
      {loading ? <div className="space-y-3 rounded-xl border border-border bg-card p-5">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : trees.length === 0 ? <EmptyState title={t("trees.empty")} description={t("trees.emptyHelp")} icon={Network} /> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[var(--shadow-soft)]">
          <Table><TableHeader><TableRow><TableHead>Tree</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead>Managers</TableHead><TableHead>Specialists</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{trees.map((tree) => <TableRow key={tree.id}><TableCell><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><AgentTreeMark className="size-5" /></span><div className="min-w-0"><p className="font-semibold">{tree.name}</p><p className="mt-1 max-w-sm truncate text-xs text-muted-foreground">{tree.description || t("trees.noDescription")}</p></div></div></TableCell><TableCell><Badge variant={statusVariant(tree.status)}>{t(`status.${tree.status}`)}</Badge></TableCell><TableCell>v{tree.version_number}</TableCell><TableCell>{tree.managers_count}</TableCell><TableCell>{tree.specialists_count}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{new Date(tree.updated_at).toLocaleString(i18n.language)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title={t("common.open")} onClick={() => navigate(`/trees/${tree.id}`)}><Eye className="size-4" /><span className="sr-only">{t("common.open")}</span></Button>{tree.status === "draft" ? <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => navigate(`/trees/${tree.id}/edit`)}><Pencil className="size-4" /><span className="sr-only">{t("common.edit")}</span></Button> : null}<Button variant="ghost" size="icon" title={t("common.delete")} onClick={() => void remove(tree)}><Trash2 className="size-4" /><span className="sr-only">{t("common.delete")}</span></Button></div></TableCell></TableRow>)}</TableBody></Table>
        </div>
      )}
    </div>
  )
}
