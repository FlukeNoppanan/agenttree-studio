import { type FormEvent } from "react"

import { AgentForm } from "@/components/tree/agent-form"
import type { WizardAgent } from "@/components/tree/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AgentType, ProviderConnection, ToolConnection } from "@/lib/api"

interface AgentEditorDialogProps {
  open: boolean
  title: string
  description: string
  value: WizardAgent | null
  providers: ProviderConnection[]
  agentType: AgentType
  reviewLabel?: string
  tools?: ToolConnection[]
  onChange: (value: WizardAgent) => void
  onSave: () => void
  onOpenChange: (open: boolean) => void
}

export function AgentEditorDialog({ open, title, description, value, providers, agentType, reviewLabel, tools = [], onChange, onSave, onOpenChange }: AgentEditorDialogProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSave()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {value ? <form onSubmit={submit}><AgentForm value={value} onChange={onChange} providers={providers} agentType={agentType} reviewLabel={reviewLabel} tools={tools} /><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Save Agent</Button></DialogFooter></form> : null}
      </DialogContent>
    </Dialog>
  )
}
