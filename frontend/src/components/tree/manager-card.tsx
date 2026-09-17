import { Pencil, Trash2, Users } from "lucide-react"

import type { WizardManager } from "@/components/tree/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ManagerCardProps {
  manager: WizardManager
  onEdit: () => void
  onDelete: () => void
}

export function ManagerCard({ manager, onEdit, onDelete }: ManagerCardProps) {
  return (
    <Card className="border-manager-agent/40 bg-manager-agent/[0.06] hover:border-primary/25 hover:shadow-[var(--shadow-lifted)]">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle className="text-base">{manager.agent.name || "Untitled Manager"}</CardTitle><p className="mt-1.5 text-sm text-muted-foreground">{manager.agent.description || "No description"}</p></div>
        <div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={onEdit}><Pencil className="size-4" /><span className="sr-only">Edit</span></Button><Button type="button" variant="ghost" size="icon" onClick={onDelete}><Trash2 className="size-4" /><span className="sr-only">Delete</span></Button></div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{manager.specialists.length} specialists</span>
        {manager.agent.capabilities.map((capability) => <span key={capability} className="rounded-full border border-primary/10 bg-card/65 px-2 py-1">{capability.replaceAll("-", " ")}</span>)}
      </CardContent>
    </Card>
  )
}
