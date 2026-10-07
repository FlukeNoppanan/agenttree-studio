import { ModelCatalog } from "@/components/model-compatibility"
import type { TFunction } from "i18next"
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RefreshCw,
  ServerCog,
  TestTube2,
  Trash2,
} from "lucide-react"
import { Fragment, type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Link } from "react-router-dom"
import { useAuth } from "@/auth"
import { EmptyState } from "@/components/empty-state"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { ResourceDependencyDialog } from "@/components/resource-dependency-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { isProviderVerificationBlocked, isUsableModel, needsQualification, qualificationAttempt, qualificationCounts } from "@/lib/provider-models"

const providerLabels: Record<ProviderType, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  cerebras: "Cerebras",
  openai_compatible: "Custom OpenAI-compatible",
  ollama: "Ollama",
}

function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  const { t } = useTranslation()
  const variant = status === "connected" ? "success" : status === "error" ? "destructive" : "secondary"
  return <Badge variant={variant}>{t(status === "not_configured" ? "status.notConfigured" : `status.${status}`)}</Badge>
}

const emptyForm: ProviderPayload = {
  name: "",
  provider_type: "openai",
  secret_id: null,
  base_url: null,
}

type ProviderWorkflowStep = "connecting" | "connected" | "discovering" | "verifying" | "ready" | "verification_paused" | "connection_failed" | "discovery_failed"
interface ProviderWorkflow {
  step: ProviderWorkflowStep
  message?: string
  modelId?: string
  current?: number
  total?: number
  reason?: string
}

function workflowLabel(workflow: ProviderWorkflow, t: TFunction): string {
  if (workflow.step === "connecting") return t("uiCopy.connecting")
  if (workflow.step === "connected") return t("status.connected")
  if (workflow.step === "discovering") return t("uiCopy.discoveringModels")
  if (workflow.step === "verifying") return t("uiCopy.providerVerifying", { model: workflow.modelId, current: workflow.current, total: workflow.total })
  if (workflow.step === "ready") return t("status.ready")
  if (workflow.step === "verification_paused") return t("qualificationFlow.paused") + (workflow.reason ? ` · ${t(`compatibility.reasons.${workflow.reason}`, {defaultValue:t("qualificationFlow.providerInterrupted")})}` : "")
  if (workflow.step === "connection_failed") return t("uiCopy.providerConnectionFailed", { message: workflow.message ?? t("uiCopy.providerConnectionTestFailed") })
  return t("uiCopy.providerDiscoveryFailed", { message: workflow.message ?? t("uiCopy.providerModelDiscoveryFailed") })
}

export function ProvidersPage() {
  const { can } = useAuth()
  const { t, i18n } = useTranslation()
  const [providers, setProviders] = useState<ProviderConnection[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [workflowByProvider, setWorkflowByProvider] = useState<Record<string, ProviderWorkflow>>({})
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderConnection | null>(null)
  const [form, setForm] = useState<ProviderPayload>(emptyForm)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<ProviderConnection | null>(null)
  const activeProviderWork = useRef(new Set<string>())

  const loadPage = useCallback(async () => {
    setLoading(true)
    try {
      const [providerResult, secretResult] = await Promise.allSettled([api.listProviders(), can("manage_secrets") ? api.listSecrets() : Promise.resolve([])])
      if (providerResult.status === "rejected") throw providerResult.reason
      setProviders(providerResult.value)
      if (secretResult.status === "fulfilled") {
        setSecrets(secretResult.value)
      } else {
        setSecrets([])
        const message = secretResult.reason instanceof Error ? secretResult.reason.message : "Unable to load saved Secrets"
        setNotice({ tone: "error", message: `Providers loaded, but saved Secrets could not be loaded: ${message}` })
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load providers" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadPage() }, [loadPage])
  const focusedProviderId = new URLSearchParams(window.location.search).get("focus")
  useEffect(() => {
    if (focusedProviderId && providers.some((item) => item.id === focusedProviderId)) {
      document.getElementById(`provider-${focusedProviderId}`)?.scrollIntoView?.({ block: "center" })
    }
  }, [focusedProviderId, providers])

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
      const previous = editing
      const mustRevalidate = !previous ||
        previous.provider_type !== form.provider_type ||
        previous.secret_id !== form.secret_id ||
        previous.base_url !== form.base_url
      const saved = previous
        ? await api.updateProvider(previous.id, form)
        : await api.createProvider(form)
      if (previous) replaceProvider(saved)
      else setProviders((current) => [saved, ...current])
      if (previous && mustRevalidate) {
        setModelsByProvider((current) => {
          const next = { ...current }
          delete next[previous.id]
          return next
        })
      }
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm)
      if (mustRevalidate) {
        setNotice({ tone: "success", message: "Provider saved. Starting connection and model checks…" })
        await runDiscoveryWorkflow(saved, true)
      } else {
        setNotice({ tone: "success", message: "Provider updated." })
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save provider" })
    } finally {
      setBusy(null)
    }
  }

  function replaceProvider(updated: ProviderConnection) {
    setProviders((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  async function refreshProvider(providerId: string) {
    try {
      const latest = await api.listProviders()
      setProviders(latest)
      return latest.find((item) => item.id === providerId)
    } catch {
      return undefined
    }
  }

  async function testConnection(provider: ProviderConnection) {
    if (activeProviderWork.current.has(provider.id)) return
    activeProviderWork.current.add(provider.id)
    setBusy(`test:${provider.id}`)
    setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "connecting" } }))
    try {
      const updated = await api.testProvider(provider.id)
      replaceProvider(updated)
      setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "connected" } }))
      setNotice({ tone: "success", message: `${provider.name} connected successfully.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed"
      await refreshProvider(provider.id)
      setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "connection_failed", message } }))
      setNotice({ tone: "error", message })
    } finally {
      activeProviderWork.current.delete(provider.id)
      setBusy(null)
    }
  }

  const stoppedQualification = useRef(new Set<string>())
  async function stopQualification(id: string) {
    stoppedQualification.current.add(id)
    try { await api.stopProviderQualification(id) }
    catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : t("qualificationFlow.stopFailed") }) }
  }

  async function runDiscoveryWorkflow(provider: ProviderConnection, testFirst: boolean, resume = false) {
    if (activeProviderWork.current.has(provider.id)) return
    activeProviderWork.current.add(provider.id)
    setBusy(`${testFirst ? "onboard" : "discover"}:${provider.id}`)
    setExpandedProviders((current) => new Set(current).add(provider.id))

    if (testFirst) {
      setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "connecting" } }))
      try {
        const connected = await api.testProvider(provider.id)
        replaceProvider(connected)
        setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "connected" } }))
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection test failed"
        await refreshProvider(provider.id)
        setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "connection_failed", message } }))
        setNotice({ tone: "error", message })
        activeProviderWork.current.delete(provider.id)
        setBusy(null)
        return
      }
    }

    setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "discovering" } }))
    try {
      stoppedQualification.current.delete(provider.id)
      await api.startProviderQualification(provider.id)
      const catalog = resume ? null : await api.discoverModelCatalog(provider.id)
      if (catalog) replaceProvider(catalog.provider)
      let models = catalog ? catalog.models : await api.listModels(provider.id, true)
      setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
      const candidates = models.filter(needsQualification)
      let verificationPaused = false
      let pauseReason: string | undefined

      for (const [index, model] of candidates.entries()) {
        if (stoppedQualification.current.has(provider.id)) { verificationPaused = true; pauseReason = "verification_stopped"; break }
        setWorkflowByProvider((current) => ({
          ...current,
          [provider.id]: {
            step: "verifying", modelId: model.model_id,
            current: index + 1, total: candidates.length,
          },
        }))
        models = models.map((item) => item.model_id === model.model_id
          ? { ...item, qualification_status: "verifying", qualification_message: "Verification in progress" }
          : item)
        setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
        try {
          await api.startProviderQualification(provider.id)
      const result = await api.verifyProviderModel(provider.id, model.model_id)
          replaceProvider(result.provider)
          models = models.map((item) => item.model_id === result.model.model_id ? result.model : item)
          verificationPaused = isProviderVerificationBlocked(result.model)
          pauseReason = qualificationAttempt(result.model).reason_code ?? result.model.qualification_error_code ?? undefined
        } catch {
          // A transport failure is not evidence that the model is incompatible.
          // Pause rather than sending more requests while the API is unavailable.
          verificationPaused = true
          models = models.map(item => item.model_id === model.model_id ? {
            ...model,
            qualification_status: ["qualified", "limited"].includes(model.qualification_status) ? model.qualification_status : "transient_error",
            metadata:{...model.metadata, qualification_attempt:{status:"pending",scope:"provider",reason_code:"verification_failed"}},
          } : item)
        }
        setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
        if (verificationPaused) break
      }

      const counts = qualificationCounts(models)
      verificationPaused ||= counts.pending > 0 || counts.rechecks > 0
      setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: verificationPaused ? "verification_paused" : "ready", reason:pauseReason } }))
      setNotice({ tone: "success", message: t("qualificationFlow.saved", { checked:counts.checked, total:counts.total, pending:counts.pending }) })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model discovery failed"
      await refreshProvider(provider.id)
      setWorkflowByProvider((current) => ({ ...current, [provider.id]: { step: "discovery_failed", message } }))
      setNotice({ tone: "error", message })
    } finally {
      activeProviderWork.current.delete(provider.id)
      setBusy(null)
    }
  }

  async function discover(provider: ProviderConnection) {
    await runDiscoveryWorkflow(provider, false)
  }

  async function verifySingle(provider: ProviderConnection, model: ProviderModel) {
    if (activeProviderWork.current.has(provider.id)) return
    activeProviderWork.current.add(provider.id)
    setBusy(`verify:${provider.id}`)
    setModelsByProvider(current => ({ ...current, [provider.id]: (current[provider.id] ?? []).map(item => item.id === model.id ? { ...item, qualification_status: "verifying" } : item) }))
    try {
      await api.startProviderQualification(provider.id)
      const result = await api.verifyProviderModel(provider.id, model.model_id)
      replaceProvider(result.provider)
      setModelsByProvider(current => ({ ...current, [provider.id]: (current[provider.id] ?? []).map(item => item.id === model.id ? result.model : item) }))
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : t("compatibility.checkFailed") })
      const models = await api.listModels(provider.id, true).catch(() => null)
      if (models) setModelsByProvider(current => ({ ...current, [provider.id]: models }))
    } finally { activeProviderWork.current.delete(provider.id); setBusy(null) }
  }

  async function viewModels(provider: ProviderConnection) {
    if (expandedProviders.has(provider.id)) {
      setExpandedProviders((current) => { const next = new Set(current); next.delete(provider.id); return next })
      return
    }
    setBusy(`models:${provider.id}`)
    try {
      const models = await api.listModels(provider.id, true)
      setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
      setExpandedProviders((current) => new Set(current).add(provider.id))
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load models" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
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
          action={<Button onClick={openCreate}>{t("onboarding.providerAction")}</Button>}
        />
      ) : (
        <div className="overflow-hidden border-y border-border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("agents.provider")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead>{t("designV3.models")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("common.lastChecked")}</TableHead><TableHead className="min-w-[180px] text-right">{t("common.actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <Fragment key={provider.id}>
                <TableRow id={`provider-${provider.id}`} className={focusedProviderId === provider.id ? "bg-accent/60" : undefined}>
                  <TableCell><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ServerCog className="size-5" /></span><div><p className="font-semibold">{provider.name}</p><p className="mt-1 text-xs text-muted-foreground">{providerLabels[provider.provider_type]}</p></div></div></TableCell>
                  <TableCell>
                    <ProviderStatusBadge status={provider.status} />
                    {workflowByProvider[provider.id] ? <p className={`mt-1.5 max-w-64 text-xs ${workflowByProvider[provider.id].step.endsWith("failed") ? "text-destructive" : "text-muted-foreground"}`}>{workflowLabel(workflowByProvider[provider.id], t)}</p> : null}
                    {!workflowByProvider[provider.id] && provider.last_error ? <p className="mt-1.5 max-w-48 text-xs text-destructive">{provider.last_error}</p> : null}
                  </TableCell>
                  <TableCell>
                    <p>{t("providers.modelsReady", { count: provider.models_count })}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("qualificationFlow.counts", {limited:provider.limited_models_count ?? 0, unavailable:provider.unavailable_models_count, pending:provider.pending_models_count ?? provider.transient_models_count})}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("qualificationFlow.progress", {checked:provider.checked_models_count ?? 0, total:provider.candidate_models_count ?? provider.discovered_models_count})}</p>
                    {provider.pending_rechecks_count ? <p className="text-xs text-muted-foreground">{t("qualificationFlow.rechecks",{count:provider.pending_rechecks_count})}</p> : null}
                    {provider.qualification_pause_code && !workflowByProvider[provider.id] && <p className="mt-1 text-xs text-warning">{t("qualificationFlow.paused")} · {t(`compatibility.reasons.${provider.qualification_pause_code}`,{defaultValue:t("qualificationFlow.providerInterrupted")})}</p>}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell">{provider.last_checked_at ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(provider.last_checked_at)) : t("common.never")}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" className="h-8 px-2" title={t("providers.test")} aria-label={t("providers.test")} disabled={busy !== null} onClick={() => void testConnection(provider)}>
                        <TestTube2 className={busy === `test:${provider.id}` ? "size-4 animate-pulse" : "size-4"} /><span className="hidden xl:inline">{t("providers.test")}</span>
                      </Button>
                      <Button variant="outline" className="h-8 px-2" title={t("providers.discover")} aria-label={t("providers.discover")} disabled={busy !== null} onClick={() => void discover(provider)}>
                        <RefreshCw className={busy === `discover:${provider.id}` ? "size-4 animate-spin" : "size-4"} /><span className="hidden xl:inline">{t("providers.discover")}</span>
                      </Button>
                      {activeProviderWork.current.has(provider.id) && workflowByProvider[provider.id]?.step === "verifying" && <Button variant="outline" className="h-8 px-2" onClick={() => void stopQualification(provider.id)}>{t("qualificationFlow.stop")}</Button>}
                      <Button variant="outline" className="h-8 px-2" disabled={busy !== null} onClick={() => void runDiscoveryWorkflow(provider, false, true)}>{t("qualificationFlow.continue")}</Button>
                      <Button variant="ghost" className="h-8 px-2" title={t(expandedProviders.has(provider.id) ? "providers.hideModels" : "providers.viewModels")} aria-label={t(expandedProviders.has(provider.id) ? "providers.hideModels" : "providers.viewModels")} aria-expanded={expandedProviders.has(provider.id)} aria-controls={`models-${provider.id}`} disabled={busy !== null} onClick={() => void viewModels(provider)}>
                        {expandedProviders.has(provider.id) ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}<span className="hidden xl:inline">{t(expandedProviders.has(provider.id) ? "providers.hideModels" : "providers.viewModels")}</span>
                      </Button>
                      <Button variant="ghost" size="icon" title={t("uiCopy.editProvider")} disabled={busy !== null} onClick={() => openEdit(provider)}>
                        <Pencil className="size-4" /><span className="sr-only">{t("uiCopy.edit")}</span>
                      </Button>
                      <Button variant="ghost" size="icon" title={t("uiCopy.deleteProvider")} disabled={busy !== null} onClick={() => setDeletingProvider(provider)}>
                        <Trash2 className="size-4" /><span className="sr-only">{t("uiCopy.delete")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedProviders.has(provider.id) ? <TableRow id={`models-${provider.id}`} className="bg-secondary/20"><TableCell colSpan={5} className="p-4 sm:p-6"><div className="border-l-2 border-primary/40 pl-4 sm:pl-5"><ModelCatalog models={modelsByProvider[provider.id] ?? []} disabled={busy !== null} onVerify={model => void verifySingle(provider, model)} /></div></TableCell></TableRow> : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("uiCopy.editProvider") : t("uiCopy.addProvider")}</DialogTitle>
            <DialogDescription>{t("uiCopy.providerCredentialHelp")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="provider-name">{t("uiCopy.name")}</Label><Input id="provider-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OpenAI Main" required autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="provider-type">{t("uiCopy.providerType")}</Label><Select id="provider-type" value={form.provider_type} onChange={(e) => setProviderType(e.target.value as ProviderType)}><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option><option value="cerebras">Cerebras</option><option value="openai_compatible">Custom OpenAI-compatible</option><option value="ollama">Ollama</option></Select></div>

              {form.provider_type !== "ollama" ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-secret">Secret</Label>
                  <Select id="provider-secret" value={form.secret_id ?? ""} onChange={(e) => setForm({ ...form, secret_id: e.target.value || null })} required>
                    <option value="" disabled>{t("uiCopy.selectASavedSecret")}</option>
                    {secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name} · {secret.masked_value}</option>)}
                  </Select>
                  {secrets.length === 0 ? <p className="text-xs text-warning">{can("manage_secrets") ? <Link className="underline underline-offset-2" to="/secrets">{t("onboarding.saveSecret")}</Link> : t("uiCopy.askAnAdministratorToSaveProviderCredentialsInSecretsFirst")}</p> : null}
                </div>
              ) : null}

              {form.provider_type === "ollama" || form.provider_type === "openai" || form.provider_type === "openai_compatible" ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-base-url">Base URL {form.provider_type === "openai" ? t("uiCopy.optional") : ""}</Label>
                  <Input id="provider-base-url" type="url" value={form.base_url ?? ""} onChange={(e) => setForm({ ...form, base_url: e.target.value || null })} placeholder={form.provider_type === "ollama" ? "http://localhost:11434" : "https://api.example.com/v1"} required={form.provider_type !== "openai"} />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t("uiCopy.cancel")}</Button>
              <Button type="submit" disabled={busy !== null || (form.provider_type !== "ollama" && !form.secret_id)}>{busy === "save" ? t("uiCopy.saving") : editing ? t("uiCopy.saveChanges") : t("uiCopy.addProvider")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ResourceDependencyDialog resource={deletingProvider && { id: deletingProvider.id, name: deletingProvider.name, type: "provider" }} inspect={api.getProviderDependencies} remove={api.deleteProvider} onClose={() => setDeletingProvider(null)} onDeleted={async () => { await loadPage(); if (deletingProvider) { setExpandedProviders((current) => { const next = new Set(current); next.delete(deletingProvider.id); return next }); setModelsByProvider((current) => { const next = { ...current }; delete next[deletingProvider.id]; return next }) } setNotice({ tone: "success", message: t("resourceDeletion.deleted", { type: t("resourceDeletion.types.provider") }) }) }} />
    </div>
  )
}
