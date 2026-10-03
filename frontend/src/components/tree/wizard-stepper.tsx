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
          <button type="button" aria-current={current === index ? "step" : undefined} onClick={() => onSelect(index)} className={cn(
            "flex min-h-14 w-full items-center gap-2.5 border-b-2 px-3 py-2.5 text-left text-sm font-medium leading-5 transition-[color,background-color,border-color,box-shadow]",
            current === index ? "border-primary bg-accent text-primary" : index < current ? "border-success/25 bg-success/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent/50",
          )}>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", current === index ? "bg-primary text-primary-foreground" : index < current ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground")}>{index < current ? <Check className="size-4" /> : <StepIcon className="size-4" />}</span>
            <span>{step}</span>
          </button>
        </li>
      })}
    </ol>
  )
}
