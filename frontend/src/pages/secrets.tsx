import { KeyRound, Plus, Trash2 } from "lucide-react"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "@/components/empty-state"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
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
      const created = await api.createSecret({ name, secret_type: secretType, value })
      setValue("")
      setSecrets((current) => [created, ...current])
      setDialogOpen(false)
      resetForm()
      setNotice({ tone: "success", message: "Secret saved securely." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save secret" })
    } finally {
      setSaving(false)
    }
  }

  async function remove(secret: Secret) {
    if (!window.confirm(`Delete “${secret.name}”? This cannot be undone.`)) return
    try {
      await api.deleteSecret(secret.id)
      setSecrets((current) => current.filter((item) => item.id !== secret.id))
      setNotice({ tone: "success", message: "Secret deleted." })
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete secret" })
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
        <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[var(--shadow-soft)]">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Masked value</TableHead>
              <TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {secrets.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell className="font-medium">{secret.name}</TableCell>
                  <TableCell className="text-muted-foreground">{secret.secret_type}</TableCell>
                  <TableCell><code className="rounded bg-muted px-2 py-1 text-xs">{secret.masked_value}</code></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(secret.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => void remove(secret)} title="Delete secret">
                      <Trash2 className="size-4" /><span className="sr-only">Delete</span>
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
            <DialogTitle>Add secret</DialogTitle>
            <DialogDescription>The value is encrypted before storage and will not be retrievable through the API.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="secret-name">Name</Label><Input id="secret-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI Main Key" required autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="secret-type">Type</Label><Input id="secret-type" value={secretType} onChange={(e) => setSecretType(e.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="secret-value">Value</Label><Input id="secret-value" type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" required /><p className="text-xs text-muted-foreground">This plaintext is cleared from the form immediately after saving.</p></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => changeDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save secret"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
