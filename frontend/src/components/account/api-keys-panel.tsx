import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { api, type ApiToken } from "@/lib/api"

export function ApiKeysPanel({ enabled }: { enabled: boolean }) {
  const { t, i18n } = useTranslation()
  const [keys, setKeys] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [raw, setRaw] = useState("")
  const [revealed, setRevealed] = useState(true)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    void api.listTokens().then(rows => { if (active) setKeys(rows) })
      .catch(() => { if (active) setError(t("apiKeys.loadError")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [enabled, t])

  function closeDialog() { if (creating) return; setDialogOpen(false); setRaw(""); setName(""); setRevealed(true); setCopied(false) }
  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true); setError("")
    try {
      const created = await api.createToken(name.trim())
      const { token, ...metadata } = created
      setKeys(current => [metadata, ...current])
      setRaw(token); setRevealed(true); setCopied(false)
    } catch { setError(t("apiKeys.createError")) }
    finally { setCreating(false) }
  }
  async function copy() {
    try {
      let copied = false
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(raw); copied = true }
        catch { /* Clipboard API can be denied on insecure LAN origins. */ }
      }
      if (!copied) {
        const field = document.createElement("textarea")
        field.value = raw; field.style.position = "fixed"; field.style.opacity = "0"
        document.body.appendChild(field); field.select()
        let fallbackCopied = false
        try { fallbackCopied = document.execCommand("copy") }
        finally { field.remove() }
        if (!fallbackCopied) throw new Error("Copy failed")
      }
      setCopied(true)
    } catch { setError(t("apiKeys.copyError")) }
  }
  async function revoke(id: string) {
    if (revoking || !window.confirm(t("apiKeys.confirmRevoke"))) return
    setRevoking(id); setError("")
    try { await api.revokeToken(id); setKeys(current => current.filter(key => key.id !== id)) }
    catch { setError(t("apiKeys.revokeError")) }
    finally { setRevoking(null) }
  }

  return <section><div className="py-4"><CardTitle>{t("apiKeys.title")}</CardTitle><p className="text-sm text-muted-foreground">{t("apiKeys.description")}</p></div><div className="space-y-5">
    {!enabled ? <p className="text-sm text-muted-foreground">{t("apiKeys.unavailable")}</p> : <>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={() => { setError(""); setDialogOpen(true) }}>{t("apiKeys.create")}</Button>
      {loading ? <p role="status" className="text-sm text-muted-foreground">{t("apiKeys.loading")}</p> : keys.length ? <div className="divide-y divide-border border-y border-border">{keys.map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="break-all font-medium">{key.name}</p><p className="text-xs text-muted-foreground">{t("apiKeys.created", { date: new Date(key.created_at).toLocaleString(i18n.language) })}</p><p className="text-xs text-muted-foreground">{t("apiKeys.lastUsed", { date: key.last_used_at ? new Date(key.last_used_at).toLocaleString(i18n.language) : t("apiKeys.neverUsed") })}</p></div><Button variant="outline" disabled={revoking !== null} onClick={() => void revoke(key.id)}>{revoking === key.id ? t("apiKeys.revoking") : t("apiKeys.revoke")}</Button></div>)}</div> : <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">{t("apiKeys.empty")}</p>}
    </>}
    <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog() }}><DialogContent><DialogHeader><DialogTitle>{raw ? t("apiKeys.createdTitle") : t("apiKeys.create")}</DialogTitle><DialogDescription>{raw ? t("apiKeys.once") : t("apiKeys.inheritsPermissions")}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {raw ? <div className="space-y-4"><div className="rounded-lg border border-amber-500/60 bg-amber-50/50 p-3 dark:bg-amber-950/20"><code className="block break-all text-sm">{revealed ? raw : "••••••••••••••••"}</code></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy()}>{t("apiKeys.copy")}</Button><Button variant="outline" aria-pressed={!revealed} onClick={() => setRevealed(value => !value)}>{t(revealed ? "apiKeys.hide" : "apiKeys.show")}</Button></div>{copied && <p role="status" className="text-sm text-success">{t("keyUx.copied")}</p>}<DialogFooter><Button onClick={closeDialog}>{t("apiKeys.done")}</Button></DialogFooter></div> : <form onSubmit={event => void create(event)} className="space-y-4"><label className="block space-y-2 text-sm font-medium">{t("apiKeys.name")}<Input autoFocus maxLength={160} required value={name} placeholder={t("apiKeys.nameExample")} onChange={event => setName(event.target.value)} /></label><DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button><Button type="submit" disabled={!name.trim() || creating}>{creating ? t("apiKeys.creating") : t("apiKeys.create")}</Button></DialogFooter></form>}
    </DialogContent></Dialog>
  </div></section>
}
