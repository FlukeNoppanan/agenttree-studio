import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { api, type WebhookIntegration } from "@/lib/api"

export function WebhookIngressPanel({ treeId, origin, ready }: { treeId: string; origin: string; ready: boolean }) {
  const { t, i18n } = useTranslation()

  const [items, setItems] = useState<WebhookIntegration[]>([])
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.listWebhooks(treeId).then(rows => { if (active) setItems(rows) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : t("uiCopy.unableToLoadWebhooks")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [treeId])

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(""); setCopied(false)
    try { await work() }
    catch (e) { setError(e instanceof Error ? e.message : t("uiCopy.webhookActionFailed")) }
    finally { setBusy(false) }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(true) }
    catch { setError(t("uiCopy.couldNotCopySelectAndCopyTheText")) }
  }
  function retain(created: WebhookIntegration & { secret: string }) {
    const { secret, ...metadata } = created
    setItems(current => [...current.filter(item => item.id !== metadata.id), metadata])
    setRaw(secret)
  }

  return <Card><CardHeader><CardTitle>{t("uiCopy.webhookTrigger")}</CardTitle><CardDescription>{t("uiCopy.webhookIngressHelp")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {loading ? <p role="status">{t("uiCopy.loadingWebhooks")}</p> : items.length === 0 && <p>{t("uiCopy.noWebhookConfigured")}</p>}
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void action(async () => { retain(await api.createWebhook(treeId, name.trim())); setName("") }) }}>
        <Input className="max-w-sm" aria-label={t("uiCopy.webhookName")} placeholder={t("uiCopy.integrationName")} maxLength={160} required value={name} onChange={event => setName(event.target.value)} />
        <Button disabled={busy || loading || !ready || !name.trim()}>{t("uiCopy.createWebhook")}</Button>
      </form>
      {items.map(item => <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
        <p className="font-medium">{item.name} · {item.enabled ? t("uiCopy.active") : t("uiCopy.disabled")}</p>
        <code className="block break-all text-sm">{origin}/api/webhooks/{item.id}</code>
        <p className="text-sm">{t("uiCopy.authenticationBearerWebhookSecretConfiguredLastReceived") + " "}{item.last_received_at ? new Date(item.last_received_at).toLocaleString(i18n.language) : t("uiCopy.never")}.</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy(`${origin}/api/webhooks/${item.id}`)}>{t("uiCopy.copyUrl")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("uiCopy.rotateThisWebhookSecretThePreviousSecretWillStopWorking"))) void action(async () => retain(await api.rotateWebhook(treeId, item.id))) }}>{t("uiCopy.rotateSecret")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void action(async () => { const updated = await api.updateWebhook(treeId, item.id, !item.enabled); setItems(current => current.map(row => row.id === updated.id ? updated : row)) })}>{item.enabled ? t("uiCopy.disable") : t("uiCopy.enable")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("uiCopy.deleteWebhookConfirm", { name: item.name }))) void action(async () => { await api.deleteWebhook(treeId, item.id); setItems(current => current.filter(row => row.id !== item.id)) }) }}>{t("uiCopy.delete")}</Button>
        </div>
      </div>)}
      <p className="text-sm text-muted-foreground">{t("uiCopy.webhookPayloadHelp")}</p>
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{[
        `curl --fail-with-body -X POST '${origin}/api/webhooks/<webhook_id>'`,
        '  -H "Authorization: Bearer $AGENTTREE_WEBHOOK_SECRET"',
        "  -H 'Content-Type: application/json'",
        `  --data '{"event":{"message":"Example external event"},"metadata":{"source":"my-service"}}'`,
      ].join(" \\\n")}</pre>
      {copied && <p role="status">{t("uiCopy.copied")}</p>}
    </CardContent>
    <Dialog open={Boolean(raw)} onOpenChange={open => { if (!open) { setRaw(""); setCopied(false) } }}><DialogContent><DialogHeader><DialogTitle>{t("uiCopy.webhookSecretCreated")}</DialogTitle><DialogDescription>{t("uiCopy.webhookSecretOnceHelp")}</DialogDescription></DialogHeader>
      <code className="break-all rounded-lg border border-border p-3">{raw}</code><Button onClick={() => void copy(raw)}>{t("uiCopy.copySecret")}</Button>{copied && <p role="status">{t("uiCopy.copied")}</p>}<Button variant="outline" onClick={() => { setRaw(""); setCopied(false) }}>{t("uiCopy.done")}</Button>
    </DialogContent></Dialog>
  </Card>
}
