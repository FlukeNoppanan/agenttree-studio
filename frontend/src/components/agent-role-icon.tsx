import { GitBranch, Layers3, Target } from "lucide-react"
import type { AgentType } from "@/lib/api"

/** Role identity is shared by the palette, Inspector and execution graph. */
export function AgentRoleIcon({ role, className = "size-4" }: { role: AgentType; className?: string }) {
  const Icon = { root: GitBranch, manager: Layers3, specialist: Target }[role]
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" data-role-icon={role} />
}
