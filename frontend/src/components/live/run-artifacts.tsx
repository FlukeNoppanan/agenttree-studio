import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { LiveArtifact } from "@/lib/api"
import { api } from "@/lib/api"

function previewable(item: LiveArtifact) {
  return item.type.toLowerCase() === "patch" || /^(text\/|application\/(json|.*\+json))/.test(item.media_type)
}
export function RunArtifacts({ runId, artifacts }: { runId: string; artifacts: LiveArtifact[] }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sorted = [...artifacts].sort((a, b) => Number(b.is_final) - Number(a.is_final) || a.created_at.localeCompare(b.created_at))
  const superseded = new Set(artifacts.map((item) => item.supersedes_artifact_id).filter(Boolean))
  const open = async (item: LiveArtifact, download: boolean) => {
    setError(null)
    try {
      const blob = await api.fetchLiveArtifact(runId, item.artifact_id)
      if (download) {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url; anchor.download = item.name.split(/[\\/]/).pop() || "artifact"
        anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      } else if (blob.size <= 2_000_000) setPreview({ id: item.artifact_id, text: await blob.text() })
      else setError(t("liveV2.previewTooLarge"))
    } catch { setError(t("liveV2.artifactUnavailable")) }
  }
  return <section className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" aria-label={t("liveV2.artifacts")}>
    <h2 className="text-xl font-semibold">{t("liveV2.artifacts")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{t("baseline.resultHelp")}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    {sorted.length ? <div className="mt-3 divide-y divide-border">{sorted.map(item => <article key={item.artifact_id} className="min-w-0 py-3">
      <div className="flex flex-wrap items-center gap-2"><strong className="break-all text-sm">{item.name}</strong><span className="text-xs text-primary">{item.is_final ? t("liveV2.finalArtifact") : superseded.has(item.artifact_id) ? t("liveV2.supersededArtifact") : t("liveV2.intermediateArtifact")}</span></div>
      <p className="mt-1 break-all text-xs text-muted-foreground">{item.type} · {item.operation} · {item.path ?? "—"} · {item.producer_role} · {item.size_bytes} B</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground" title={item.sha256}>SHA-256 {item.sha256.slice(0, 12)}…</p>
      {item.body_available ? <div className="mt-2 flex gap-3">{previewable(item) ? <button className="text-sm text-primary hover:underline" onClick={() => void open(item, false)}>{t("liveV2.preview")}</button> : null}<button className="text-sm text-primary hover:underline" onClick={() => void open(item, true)}>{t("liveV2.download")}</button></div> : null}
      {preview?.id === item.artifact_id ? <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-mono text-xs">{preview.text}</pre> : null}
    </article>)}</div> : <p className="mt-5 text-sm text-muted-foreground">{t("liveV2.noArtifacts")}</p>}
  </section>
}
