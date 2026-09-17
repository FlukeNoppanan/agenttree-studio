import { Pencil, Trash2, Wrench } from "lucide-react"

import type { WizardAgent } from "@/components/tree/types"
import { Button } from "@/components/ui/button"

interface SpecialistCardProps {
  specialist: WizardAgent
  onEdit: () => void
  onDelete: () => void
}

export function SpecialistCard({ specialist, onEdit, onDelete }: SpecialistCardProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card/85 p-4 transition-[border-color,box-shadow] hover:border-primary/20 hover:shadow-[var(--shadow-soft)]">
      <div><p className="font-medium">{specialist.name || "Untitled Specialist"}</p><p className="mt-1 text-sm capitalize text-muted-foreground">{specialist.capabilities.length ? specialist.capabilities.map((item) => item.replaceAll("-", " ")).join(" · ") : "No capabilities"}</p>{specialist.autonomous_tool_use ? <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary"><Wrench className="size-3.5" />Autonomous Tool use · max {specialist.max_tool_iterations} iterations</p> : null}</div>
      <div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={onEdit}><Pencil className="size-4" /><span className="sr-only">Edit</span></Button><Button type="button" variant="ghost" size="icon" onClick={onDelete}><Trash2 className="size-4" /><span className="sr-only">Delete</span></Button></div>
    </div>
  )
}
