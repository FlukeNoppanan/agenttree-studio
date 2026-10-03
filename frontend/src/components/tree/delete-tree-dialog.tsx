import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DeleteTreeDialog({ name, open, onOpenChange, onConfirm, error }: {
  name: string; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => Promise<void>; error?: string
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  async function confirm() {
    if (busy) return
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <DialogContent onOpenAutoFocus={event => { event.preventDefault(); document.getElementById('cancel-tree-deletion')?.focus() }}>
      <DialogHeader><DialogTitle>{t('integrationPolish.deleteTreeTitle')}</DialogTitle><DialogDescription>{t('integrationPolish.deleteTreeHelp', { name })}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button id="cancel-tree-deletion" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button variant="destructive" disabled={busy} onClick={() => void confirm()}>{t('common.delete')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
