import { Pencil, Trash2 } from "lucide-react"

import type { WizardAgent } from "@/components/tree/types"
import { Button } from "@/components/ui/button"

interface SpecialistCardProps {
  specialist: WizardAgent
  onEdit: () => void
  onDelete: () => void
}

export function SpecialistCard({ specialist, onEdit, onDelete }: SpecialistCardProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4">
      <div><p className="font-medium">{specialist.name || "Untitled Specialist"}</p><p className="mt-1 text-sm capitalize text-muted-foreground">{specialist.capabilities.length ? specialist.capabilities.map((item) => item.replaceAll("-", " ")).join(" · ") : "No capabilities"}</p></div>
      <div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={onEdit}><Pencil className="size-4" /><span className="sr-only">Edit</span></Button><Button type="button" variant="ghost" size="icon" onClick={onDelete}><Trash2 className="size-4" /><span className="sr-only">Delete</span></Button></div>
    </div>
  )
}
