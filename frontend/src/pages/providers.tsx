import {
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  ServerCog,
  TestTube2,
  Trash2,
} from "lucide-react"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/empty-state"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  api,
  type ProviderConnection,
  type ProviderModel,
  type ProviderPayload,
  type ProviderStatus,
  type ProviderType,
  type Secret,
} from "@/lib/api"

const providerLabels: Record<ProviderType, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  ollama: "Ollama",
}

const statusLabels: Record<ProviderStatus, string> = {
  not_configured: "Not configured",
  testing: "Testing",
  connected: "Connected",
  error: "Error",
}

function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  const variant = status === "connected" ? "success" : status === "error" ? "destructive" : "secondary"
  return <Badge variant={variant}>{statusLabels[status]}</Badge>
}

const emptyForm: ProviderPayload = {
  name: "",
  provider_type: "openai",
  secret_id: null,
  base_url: null,
}

export function ProvidersPage() {
  const { t, i18n } = useTranslation()
  const [providers, setProviders] = useState<ProviderConnection[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [models, setModels] = useState<ProviderModel[]>([])
  const [selectedProvider, setSelectedProvider] = useState<ProviderConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderConnection | null>(null)
  const [form, setForm] = useState<ProviderPayload>(emptyForm)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)

  const loadPage = useCallback(async () => {
    setLoading(true)
    try {
      const [providerItems, secretItems] = await Promise.all([api.listProviders(), api.listSecrets()])
      setProviders(providerItems)
      setSecrets(secretItems)
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load providers" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadPage() }, [loadPage])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(provider: ProviderConnection) {
    setEditing(provider)
    setForm({
      name: provider.name,
      provider_type: provider.provider_type,
      secret_id: provider.secret_id,
      base_url: provider.base_url,
    })
    setDialogOpen(true)
  }

  function setProviderType(providerType: ProviderType) {
    setForm((current) => ({
      ...current,
      provider_type: providerType,
      secret_id: providerType === "ollama" ? null : current.secret_id,
      base_url: providerType === "ollama" ? "http://localhost:11434" : null,
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy("save")
    try {
      const saved = editing
        ? await api.updateProvider(editing.id, form)
        : await api.createProvider(form)
      setProviders((current) => editing
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current])
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm)
      setNotice({ tone: "success", message: editing ? "Provider updated." : "Provider connection added." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save provider" })
    } finally {
      setBusy(null)
    }
  }

  function replaceProvider(updated: ProviderConnection) {
    setProviders((current) => current.map((item) => item.id === updated.id ? updated : item))
    setSelectedProvider((current) => current?.id === updated.id ? updated : current)
  }

  async function testConnection(provider: ProviderConnection) {
    setBusy(`test:${provider.id}`)
    try {
      const updated = await api.testProvider(provider.id)
      replaceProvider(updated)
      setNotice({ tone: "success", message: `${provider.name} connected successfully.` })
    } catch (error) {
      await loadPage()
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Connection test failed" })
    } finally {
      setBusy(null)
    }
  }

  async function discover(provider: ProviderConnection) {
    setBusy(`discover:${provider.id}`)
    try {
      const result = await api.discoverModels(provider.id)
      replaceProvider(result.provider)
      setSelectedProvider(result.provider)
      setModels(result.models)
      setNotice({ tone: "success", message: t("providers.discovered", {
        discovered: result.summary.discovered_count,
        candidates: result.summary.candidate_count,
        usable: result.summary.usable_count,
        unavailable: result.summary.unavailable_count,
      }) })
    } catch (error) {
      await loadPage()
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Model discovery failed" })
    } finally {
      setBusy(null)
    }
  }

  async function viewModels(provider: ProviderConnection) {
    setBusy(`models:${provider.id}`)
    try {
      setModels(await api.listModels(provider.id, true))
      setSelectedProvider(provider)
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load models" })
    } finally {
      setBusy(null)
    }
  }

  async function remove(provider: ProviderConnection) {
    if (!window.confirm(`Delete “${provider.name}” and its discovered models?`)) return
    setBusy(`delete:${provider.id}`)
    try {
      await api.deleteProvider(provider.id)
      setProviders((current) => current.filter((item) => item.id !== provider.id))
      if (selectedProvider?.id === provider.id) {
        setSelectedProvider(null)
        setModels([])
      }
      setNotice({ tone: "success", message: "Provider connection deleted." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete provider" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("providers.title")}
        description={t("providers.description")}
        action={<Button onClick={openCreate}><Plus className="size-4" />{t("providers.add")}</Button>}
      />

      {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}

      {loading ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          title={t("providers.empty")}
          description={t("providers.emptyHelp")}
          icon={ServerCog}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[var(--shadow-soft)]">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Models</TableHead>
              <TableHead>Last checked</TableHead><TableHead className="min-w-[300px] text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell><p className="font-medium">{provider.name}</p><p className="mt-1 text-xs text-muted-foreground">{providerLabels[provider.provider_type]}</p></TableCell>
                  <TableCell><ProviderStatusBadge status={provider.status} />{provider.last_error ? <p className="mt-1.5 max-w-48 text-xs text-red-600 dark:text-red-400">{provider.last_error}</p> : null}</TableCell>
                  <TableCell><p>{t("providers.modelsReady", { count: provider.models_count })}</p><p className="mt-1 text-xs text-muted-foreground">{t("providers.unavailableCount", { count: provider.unavailable_models_count })}</p></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{provider.last_checked_at ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(provider.last_checked_at)) : t("common.never")}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="ghost" className="h-8 px-2" title={t("providers.test")} disabled={busy !== null} onClick={() => void testConnection(provider)}>
                        <TestTube2 className={busy === `test:${provider.id}` ? "size-4 animate-pulse" : "size-4"} />{t("providers.test")}
                      </Button>
                      <Button variant="ghost" className="h-8 px-2" title={t("providers.discover")} disabled={busy !== null} onClick={() => void discover(provider)}>
                        <RefreshCw className={busy === `discover:${provider.id}` ? "size-4 animate-spin" : "size-4"} />{t("providers.discover")}
                      </Button>
                      <Button variant="ghost" className="h-8 px-2" title={t("providers.viewModels")} disabled={busy !== null} onClick={() => void viewModels(provider)}>
                        <Eye className="size-4" />{t("providers.viewModels")}
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit provider" disabled={busy !== null} onClick={() => openEdit(provider)}>
                        <Pencil className="size-4" /><span className="sr-only">Edit</span>
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete provider" disabled={busy !== null} onClick={() => void remove(provider)}>
                        <Trash2 className="size-4" /><span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedProvider ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div><CardTitle>{selectedProvider.name}</CardTitle><CardDescription className="mt-1.5">{t("providers.modelDetails")}</CardDescription></div>
            <ProviderStatusBadge status={selectedProvider.status} />
          </CardHeader>
          <CardContent>
            {models.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No models have been discovered for this connection.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {models.map((model) => (
                  <div key={model.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0"><p className="font-medium">{model.display_name || model.model_id.replace(/^models\//, "")}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{model.model_id}</p><p className="mt-1 text-xs text-muted-foreground">{model.qualification_message}</p></div>
                    <Badge variant={model.qualification_status === "qualified" ? "success" : model.qualification_status === "transient_error" ? "secondary" : "destructive"}>{t(`status.${model.qualification_status === "transient_error" ? "transientError" : model.qualification_status}`)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit provider" : "Add provider"}</DialogTitle>
            <DialogDescription>Agents will reference this connection and a discovered model ID, never a raw credential.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="provider-name">Name</Label><Input id="provider-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OpenAI Main" required autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="provider-type">Provider type</Label><Select id="provider-type" value={form.provider_type} onChange={(e) => setProviderType(e.target.value as ProviderType)}><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="ollama">Ollama</option></Select></div>

              {form.provider_type !== "ollama" ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-secret">Secret</Label>
                  <Select id="provider-secret" value={form.secret_id ?? ""} onChange={(e) => setForm({ ...form, secret_id: e.target.value || null })} required>
                    <option value="" disabled>Select a saved secret</option>
                    {secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name} · {secret.masked_value}</option>)}
                  </Select>
                  {secrets.length === 0 ? <p className="text-xs text-amber-700 dark:text-amber-300">Add a secret before creating this provider.</p> : null}
                </div>
              ) : null}

              {form.provider_type === "ollama" || form.provider_type === "openai" ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-base-url">Base URL {form.provider_type === "openai" ? "(optional)" : ""}</Label>
                  <Input id="provider-base-url" type="url" value={form.base_url ?? ""} onChange={(e) => setForm({ ...form, base_url: e.target.value || null })} placeholder={form.provider_type === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"} required={form.provider_type === "ollama"} />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy === "save" || (form.provider_type !== "ollama" && !form.secret_id)}>{busy === "save" ? "Saving…" : editing ? "Save changes" : "Add provider"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
