import { BadgeCheck, Check, GitBranch, Sprout, TreePine, UsersRound, Wrench } from "lucide-react"

import { cn } from "@/lib/utils"

interface WizardStepperProps {
  steps: string[]
  current: number
  onSelect: (index: number) => void
}

export function WizardStepper({ steps, current, onSelect }: WizardStepperProps) {
  const icons = [Sprout, TreePine, GitBranch, UsersRound, Wrench, BadgeCheck]
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {steps.map((step, index) => {
        const StepIcon = icons[index] ?? Sprout
        return <li key={step} className="relative">
          <button type="button" onClick={() => onSelect(index)} className={cn(
            "flex min-h-14 w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold leading-4 transition-[color,background-color,border-color,box-shadow]",
            current === index ? "border-primary/35 bg-primary/8 text-primary shadow-sm" : index < current ? "border-success/20 bg-success/5 text-foreground" : "border-border bg-card/75 text-muted-foreground hover:border-primary/20 hover:bg-accent/50",
          )}>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", current === index ? "bg-primary text-primary-foreground" : index < current ? "bg-success text-white" : "bg-muted text-muted-foreground")}>{index < current ? <Check className="size-4" /> : <StepIcon className="size-4" />}</span>
            <span>{step}</span>
          </button>
        </li>
      })}
    </ol>
  )
}
