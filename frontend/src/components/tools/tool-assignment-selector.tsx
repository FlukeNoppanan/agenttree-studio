export interface EligibleSpecialist { id: string; name: string; treeName: string }

export function ToolAssignmentSelector({ specialists, selected, onChange, disabled }: { specialists: EligibleSpecialist[]; selected: string[]; onChange: (selected: string[]) => void; disabled?: boolean }) {
  if (!specialists.length) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No Specialist Agents are configured.</p>
  return <div className="space-y-2">{specialists.map((agent) => <label key={agent.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"><span><span className="font-medium">{agent.name}</span><span className="ml-2 text-xs text-muted-foreground">{agent.treeName}</span></span><input type="checkbox" disabled={disabled} className="accent-primary" checked={selected.includes(agent.id)} onChange={(event) => onChange(event.target.checked ? [...selected, agent.id] : selected.filter((id) => id !== agent.id))} /></label>)}</div>
}
