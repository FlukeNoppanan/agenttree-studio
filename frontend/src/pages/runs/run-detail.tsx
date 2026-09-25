import { ArrowLeft } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { ExecutionInspector } from "@/components/execution-inspector"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type RunDetail, type TreeDetail } from "@/lib/api"

export function RunDetailPage() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!runId) return
    let active = true
    let busy = false
    const refresh = async () => {
      if (busy || document.hidden) return
      busy = true
      try {
        const item = await api.getRun(runId)
        if (active) { setRun(item); setError(null) }
        if (active && !tree) {
          const detail = await api.getTree(item.tree_id)
          if (active) setTree(detail)
        }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : t("live.loadError")) }
      finally { busy = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [runId, t, tree])
  return <div className="space-y-5"><Button variant="ghost" onClick={() => navigate(run ? `/trees/${run.tree_id}/live` : "/runs")}><ArrowLeft className="size-4" />{t("live.backToLive")}</Button>{error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}{run ? <ExecutionInspector run={run} tree={tree} /> : !error ? <Skeleton className="h-96 w-full" /> : null}</div>
}
