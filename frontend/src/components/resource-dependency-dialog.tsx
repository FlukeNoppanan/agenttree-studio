import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ApiError, type ResourceDependencies, type ResourceDependency } from "@/lib/api"

type Resource = { id: string; name: string; type: "secret" | "provider" | "tool" }

interface Props {
  resource: Resource | null
  inspect: (id: string) => Promise<ResourceDependencies>
  remove: (id: string) => Promise<void>
  onClose: () => void
  onDeleted: () => void | Promise<void>
}

function target(dependency: ResourceDependency): string | null {
  if (dependency.type === "provider") return `/providers?focus=${encodeURIComponent(dependency.id)}`
  if (dependency.type === "tool") return `/tools?focus=${encodeURIComponent(dependency.id)}`
  if (dependency.tree_id) return `/trees/${encodeURIComponent(dependency.tree_id)}`
  return null
}

export function ResourceDependencyDialog({ resource, inspect, remove, onClose, onDeleted }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState<ResourceDependencies | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      setInspection(await inspect(id))
    } catch (cause) {
      setInspection(null)
      setError(cause instanceof Error ? cause.message : t("resourceDeletion.inspectError"))
    } finally {
      setLoading(false)
    }
  }, [inspect, t])

  useEffect(() => {
    if (!resource) { setInspection(null); setError(null); return }
    void refresh(resource.id)
  }, [resource?.id, refresh])

  async function confirm() {
    if (!resource || inspection?.resource.id !== resource.id || !inspection.can_delete || deleting) return
    setDeleting(true)
    setError(null)
    try {
      const latest = await inspect(resource.id)
      setInspection(latest)
      if (!latest.can_delete) {
        setError(t("resourceDeletion.changed"))
        return
      }
      await remove(resource.id)
      await onDeleted()
      onClose()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await refresh(resource.id)
        setError(t("resourceDeletion.changed"))
      } else {
        setError(cause instanceof Error ? cause.message : t("resourceDeletion.deleteError"))
      }
    } finally {
      setDeleting(false)
    }
  }

  const currentInspection = inspection?.resource.id === resource?.id ? inspection : null
  const dependencies = currentInspection?.dependencies ?? []
  const blocked = Boolean(currentInspection && !currentInspection.can_delete)
  return (
    <Dialog open={Boolean(resource)} onOpenChange={(open) => { if (!open && !deleting) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(blocked ? "resourceDeletion.blockedTitle" : "resourceDeletion.confirmTitle", { type: resource ? t(`resourceDeletion.types.${resource.type}`) : "" })}</DialogTitle>
          <DialogDescription>{resource?.name}</DialogDescription>
        </DialogHeader>
        {loading ? <p className="text-sm text-muted-foreground">{t("resourceDeletion.checking")}</p> : null}
        {blocked ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t(resource?.type === "provider" ? "resourceDeletion.providerBlockedHelp" : resource?.type === "tool" ? "resourceDeletion.toolBlockedHelp" : "resourceDeletion.blockedHelp", { count: dependencies.length })}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("resourceDeletion.usedBy")}</p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {dependencies.map((dependency, index) => {
                const href = target(dependency)
                return <div key={`${dependency.type}-${dependency.id}-${index}`} className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{dependency.tree_name ? `${t("resourceDeletion.tree")}: ${dependency.tree_name}` : `${t(`resourceDeletion.types.${dependency.type}`)}: ${dependency.name}`}</p>
                  {dependency.agent_name ? <p className="mt-1 text-muted-foreground">{t(dependency.agent_type === "specialist" ? "resourceDeletion.specialist" : "resourceDeletion.agent")}: {dependency.agent_name}</p> : null}
                  {dependency.model_id ? <p className="mt-1 text-muted-foreground">{t("resourceDeletion.model")}: {dependency.model_id}</p> : null}
                  {dependency.capabilities.length ? <p className="mt-1 text-muted-foreground">{t("resourceDeletion.capabilities")}: {dependency.capabilities.join(", ")}</p> : null}
                  {dependency.tree_version ? <p className="mt-1 text-xs text-muted-foreground">{t("resourceDeletion.version", { number: dependency.tree_version })}</p> : null}
                  {dependency.type === "destination" ? <p className="mt-1 text-muted-foreground">{t("resourceDeletion.destination")}: {dependency.name}</p> : null}
                  {href ? <Button variant="outline" className="mt-3" onClick={() => { onClose(); navigate(href) }}>{t(dependency.type === "provider" ? "resourceDeletion.openProvider" : dependency.type === "tool" ? "resourceDeletion.openTool" : "resourceDeletion.openTree")}</Button> : null}
                </div>
              })}
            </div>
          </div>
        ) : currentInspection?.can_delete ? <p className="text-sm text-muted-foreground">{t("resourceDeletion.safeHelp")}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>{t(blocked ? "resourceDeletion.close" : "common.cancel")}</Button>
          {!blocked && currentInspection?.can_delete ? <Button variant="destructive" onClick={() => void confirm()} disabled={loading || deleting}>{deleting ? t("resourceDeletion.deleting") : t("common.delete")}</Button> : null}
          {error && !currentInspection ? <Button variant="outline" onClick={() => resource && void refresh(resource.id)}>{t("common.refresh")}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
