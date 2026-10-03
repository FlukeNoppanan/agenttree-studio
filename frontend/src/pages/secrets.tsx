import { KeyRound, Plus, Trash2 } from "lucide-react"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/empty-state"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { ResourceDependencyDialog } from "@/components/resource-dependency-dialog"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Secret } from "@/lib/api"

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function SecretsPage() {
  const { t } = useTranslation()
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [secretType, setSecretType] = useState("api_key")
  const [value, setValue] = useState("")
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [deletingSecret, setDeletingSecret] = useState<Secret | null>(null)

  const loadSecrets = useCallback(async () => {
    setLoading(true)
    try {
      setSecrets(await api.listSecrets())
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load secrets" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSecrets() }, [loadSecrets])

  function resetForm() {
    setName("")
    setSecretType("api_key")
    setValue("")
  }

  function changeDialog(open: boolean) {
    setDialogOpen(open)
    if (!open) resetForm()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await api.createSecret({ name, secret_type: secretType, value })
      setValue("")
      await loadSecrets()
      setDialogOpen(false)
      resetForm()
      setNotice({ tone: "success", message: "Secret saved securely." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save secret" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("secrets.title")}
        description={t("secrets.description")}
        action={<Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t("secrets.add")}</Button>}
      />

      {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}

      {loading ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-12 w-full" />)}
        </div>
      ) : secrets.length === 0 ? (
        <EmptyState
          title={t("secrets.empty")}
          description={t("secrets.emptyHelp")}
          icon={KeyRound}
        />
      ) : (
        <div className="overflow-hidden border-y border-border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("uiCopy.name")}</TableHead><TableHead>{t("uiCopy.type")}</TableHead><TableHead>{t("uiCopy.maskedValue")}</TableHead>
              <TableHead>{t("uiCopy.created")}</TableHead><TableHead className="text-right">{t("uiCopy.actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {secrets.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell className="font-medium">{secret.name}</TableCell>
                  <TableCell className="text-muted-foreground">{secret.secret_type}</TableCell>
                  <TableCell><code className="rounded bg-muted px-2 py-1 text-xs">{secret.masked_value}</code></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(secret.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setDeletingSecret(secret)} title="Delete secret">
                      <Trash2 className="size-4" /><span className="sr-only">{t("uiCopy.delete")}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={changeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("uiCopy.addSecret")}</DialogTitle>
            <DialogDescription>{t("uiCopy.secretStorageHelp")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="secret-name">{t("uiCopy.name")}</Label><Input id="secret-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI Main Key" required autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="secret-type">{t("uiCopy.type")}</Label><Input id="secret-type" value={secretType} onChange={(e) => setSecretType(e.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="secret-value">{t("uiCopy.value")}</Label><Input id="secret-value" type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" required /><p className="text-xs text-muted-foreground">{t("uiCopy.thisPlaintextIsClearedFromTheFormImmediatelyAfterSaving")}</p></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => changeDialog(false)}>{t("uiCopy.cancel")}</Button>
              <Button type="submit" disabled={saving}>{saving ? t("uiCopy.saving") : "Save secret"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ResourceDependencyDialog resource={deletingSecret && { id: deletingSecret.id, name: deletingSecret.name, type: "secret" }} inspect={api.getSecretDependencies} remove={api.deleteSecret} onClose={() => setDeletingSecret(null)} onDeleted={async () => { await loadSecrets(); setNotice({ tone: "success", message: t("resourceDeletion.deleted", { type: t("resourceDeletion.types.secret") }) }) }} />
    </div>
  )
}
