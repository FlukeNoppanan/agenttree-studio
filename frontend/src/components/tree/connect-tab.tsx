import { Pencil, Plus, Send, Trash2, Webhook } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Link } from "react-router-dom"
import { ApiExamples, integrationOrigin } from "@/components/tree/api-examples"
import { WebhookIngressPanel } from "@/components/tree/webhook-ingress-panel"
import { useAuth } from "@/auth"
import { acknowledgeConnect } from "@/lib/onboarding"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { api, type ResultDestination, type Secret, type TreeDetail } from "@/lib/api"

interface WebhookDraft {
  id: string | null
  name: string
  url: string
  timeout: string
  secretId: string
}

const emptyDraft: WebhookDraft = { id: null, name: "", url: "", timeout: "10", secretId: "" }

export function ConnectTab({ tree }: { tree: TreeDetail }) {
  const { user, can } = useAuth()
  const { t } = useTranslation()
  const [destinations, setDestinations] = useState<ResultDestination[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [editor, setEditor] = useState<WebhookDraft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)
  const ready = tree.status === "ready" && tree.version.status === "ready"
  useEffect(() => {
    if (ready && user) acknowledgeConnect(user.id, tree.id)
  }, [ready, user?.id, tree.id])

  useEffect(() => {
    api.integrationConfig().then(config => setOrigin(integrationOrigin(config.public_origin, window.location.origin)))
      .catch(() => setNotice({ tone: "error", message: "Unable to load the public API origin. Reload to try again." }))
  }, [])

  useEffect(() => {
    Promise.all([api.listDestinations(tree.id), can("manage_secrets") ? api.listSecrets() : Promise.resolve([])])
      .then(([items, secretItems]) => { setDestinations(items); setSecrets(secretItems) })
      .catch((error) => setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load destinations" }))
  }, [tree.id])

  async function toggle(destination: ResultDestination) {
    setBusy(destination.id)
    try {
      const updated = await api.updateDestination(tree.id, destination.id, {
        name: destination.name, destination_type: destination.destination_type,
        enabled: !destination.enabled, configuration: destination.configuration,
        secret_id: destination.secret_id,
      })
      setDestinations((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to update destination" }) }
    finally { setBusy(null) }
  }

  async function test(destination: ResultDestination) {
    setBusy(destination.id)
    try {
      const result = await api.testDestination(tree.id, destination.id)
      setNotice({ tone: result.success ? "success" : "error", message: result.message })
    } catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Destination test failed" }) }
    finally { setBusy(null) }
  }

  async function remove(destination: ResultDestination) {
    if (!window.confirm(`Delete “${destination.name}”?`)) return
    setBusy(destination.id)
    try { await api.deleteDestination(tree.id, destination.id); setDestinations((current) => current.filter((item) => item.id !== destination.id)) }
    catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete destination" }) }
    finally { setBusy(null) }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor) return
    setBusy(editor.id ?? "new")
    const payload = {
      name: editor.name, destination_type: "webhook" as const, enabled: true,
      configuration: { url: editor.url, method: "POST", headers: {}, timeout_seconds: Number(editor.timeout) },
      secret_id: editor.secretId || null,
    }
    try {
      const saved = editor.id
        ? await api.updateDestination(tree.id, editor.id, payload)
        : await api.createDestination(tree.id, payload)
      setDestinations((current) => editor.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
      setEditor(null)
      setNotice({ tone: "success", message: t("uiCopy.destinationSaved") })
    } catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save destination" }) }
    finally { setBusy(null) }
  }

  return <div className="space-y-5">
    {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
    <div className="space-y-3"><h2 className="text-xl font-semibold">{t("revision.integration.intro")}</h2><p className="text-sm text-muted-foreground">{t("revision.integration.personal")}</p><p className="text-sm text-muted-foreground">{t("baseline.keyDirection")}</p><p className="text-sm text-muted-foreground">{t("baseline.integrationModes")}</p><Link className="text-sm font-medium text-primary underline" to="/account?section=api-keys">{t("revision.integration.keys")}</Link><p className="break-all text-sm">Tree ID: <code>{tree.id}</code></p></div>
    {!ready && <p role="status" className="text-sm text-muted-foreground">{t("uiCopy.treeReadyBeforeConnect")}</p>}
    {origin ? <><ApiExamples origin={origin} treeId={tree.id} asyncApi /><ApiExamples origin={origin} treeId={tree.id} asyncApi={false} /><WebhookIngressPanel origin={origin} treeId={tree.id} ready={ready} /></> : <p role="status">{t("uiCopy.loadingApiConfiguration")}</p>}
    {tree.version.trigger?.trigger_type === "webhook" && <p className="text-sm text-muted-foreground">{t("uiCopy.legacyWebhookHelp")}</p>}
    <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>{t("connect.destinations")}</CardTitle><CardDescription>{t("connect.destinationsHelp")}</CardDescription></div><Button onClick={() => setEditor({ ...emptyDraft })}><Plus className="size-4" />{t("connect.addDestination")}</Button></CardHeader><CardContent className="space-y-3">{destinations.map((destination) => <div key={destination.id} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium">{destination.name}</p><Badge variant={destination.enabled ? "success" : "secondary"}>{t(destination.enabled ? "status.connected" : "common.disabled")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{destination.destination_type === "webhook" ? t("uiCopy.outgoingWebhook") : destination.destination_type === "api_response" ? "API Response" : "Studio Storage"}</p></div><div className="flex flex-wrap gap-2">{destination.destination_type === "webhook" ? <Button className="h-8" variant="outline" disabled={busy === destination.id} onClick={() => void test(destination)}><Send className="size-3.5" />{t("connect.test")}</Button> : null}{destination.destination_type === "webhook" ? <Button className="h-8" variant="outline" onClick={() => setEditor({ id: destination.id, name: destination.name, url: String(destination.configuration.url ?? ""), timeout: String(destination.configuration.timeout_seconds ?? 10), secretId: destination.secret_id ?? "" })}><Pencil className="size-3.5" />{t("common.edit")}</Button> : null}<Button className="h-8" variant="outline" disabled={busy === destination.id} onClick={() => void toggle(destination)}>{t(destination.enabled ? "connect.disable" : "connect.enable")}</Button>{destination.destination_type === "webhook" ? <Button className="h-8" variant="ghost" disabled={busy === destination.id} onClick={() => void remove(destination)}><Trash2 className="size-3.5" />{t("common.delete")}</Button> : null}</div></div>)}</CardContent></Card>
    <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null) }}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Webhook className="size-5" />{t("uiCopy.webhookResultDestination")}</DialogTitle><DialogDescription>{t("uiCopy.deliverCompletedTreeResultsToAnExternalUrl")}</DialogDescription></DialogHeader>{editor ? <form className="space-y-4" onSubmit={(event) => void save(event)}><div className="space-y-2"><Label>{t("uiCopy.type")}</Label><Select value="webhook" disabled><option value="webhook">{t("uiCopy.webhook")}</option></Select></div><div className="space-y-2"><Label>{t("uiCopy.name")}</Label><Input required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Operations Webhook" /></div><div className="space-y-2"><Label>{t("uiCopy.url")}</Label><Input required type="url" value={editor.url} onChange={(event) => setEditor({ ...editor, url: event.target.value })} placeholder="https://example.com/results" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t("uiCopy.authentication")}</Label><Select value={editor.secretId} onChange={(event) => setEditor({ ...editor, secretId: event.target.value })}><option value="">{t("common.none")}</option>{secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name}</option>)}</Select></div><div className="space-y-2"><Label>{t("uiCopy.timeoutSeconds")}</Label><Input required type="number" min="1" max="60" value={editor.timeout} onChange={(event) => setEditor({ ...editor, timeout: event.target.value })} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={busy === (editor.id ?? "new")}>{busy ? t("wizard.saving") : t("connect.saveDestination")}</Button></DialogFooter></form> : null}</DialogContent></Dialog>
  </div>
}
