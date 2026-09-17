import type { LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

interface PlaceholderPageProps {
  title: string
  description: string
  icon: LucideIcon
}

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />
      <EmptyState
        title={`${title} is coming next`}
        description="The navigation and layout are ready. This workflow will be introduced in a later AgentTree Studio phase."
        icon={icon}
      />
    </div>
  )
}
