import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { LiveEvent, TreeDetail } from "@/lib/api"
import type { LiveModel } from "@/lib/run-live"

function metadata(event: LiveEvent): Record<string, unknown> {
  const value = event.payload.metadata
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown): string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null }
function kind(event: LiveEvent): "tool" | "collaboration" | "review" | "activity" {
  const name = event.type.toLowerCase()
  if (name.includes("tool")) return "tool"
  if (name.includes("collaboration") || name.includes("peer") || name.includes("message")) return "collaboration"
  if (name.includes("review") || name.includes("revision")) return "review"
  return "activity"
}
function readable(type: string): string {
  const words = type.replaceAll(/[._]/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function RunTimeline({ model, tree, versionId }: { model: LiveModel; tree: TreeDetail | null; versionId: string }) {
  const { t, i18n } = useTranslation()
  const [inspected, setInspected] = useState<LiveEvent | null>(null)
  const agents = tree?.version.id === versionId ? tree.version.agents : []
  const groups = useMemo(() => {
    const output = new Map<string, { id: string; name: string; role: string; events: LiveEvent[]; transcripts: string[] }>()
    for (const agent of agents) output.set(agent.id, { id: agent.id, name: agent.name, role: agent.agent_type, events: [], transcripts: [] })
    for (const event of model.events) {
      const id = event.agent_id ?? "system"
      if (!output.has(id)) output.set(id, { id, name: event.agent_name ?? (id === "system" ? t("liveV2.system") : id), role: id === "system" ? "system" : "agent", events: [], transcripts: [] })
      output.get(id)!.events.push(event)
    }
    for (const [key, transcript] of Object.entries(model.text)) {
      const [role, id] = key.split(":")
      if (!output.has(id)) output.set(id, { id, name: id, role, events: [], transcripts: [] })
      output.get(id)!.transcripts.push(transcript)
    }
    return [...output.values()].filter(item => item.events.length || item.transcripts.length)
      .sort((a, b) => ({ root: 0, manager: 1, specialist: 2, agent: 3, system: 4 }[a.role] ?? 5) - ({ root: 0, manager: 1, specialist: 2, agent: 3, system: 4 }[b.role] ?? 5))
  }, [agents, model.events, model.text, t])
  const threads = useMemo(() => {
    const grouped = new Map<string, LiveEvent[]>()
    for (const event of model.events) {
      if (kind(event) !== "collaboration") continue
      const id = text(metadata(event).thread_id)
      if (!id) continue
      grouped.set(id, [...(grouped.get(id) ?? []), event])
    }
    return [...grouped.entries()]
  }, [model.events])
  return <section className="min-w-0" aria-label={t("liveV2.timeline")}>
    <div className="flex items-end justify-between gap-3 border-b border-border pb-3"><h2 className="text-xl font-semibold">{t("liveV2.timeline")}</h2><span className="text-xs text-muted-foreground">{model.events.length} / {model.cursor}</span></div>
    {groups.length ? <div className="divide-y divide-border">{groups.map(group => {
      const agent = agents.find(item => item.id === group.id)
      const parent = agents.find(item => item.id === agent?.parent_agent_id)
      return <section key={group.id} className="min-w-0 py-5">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-widest text-primary">{t(`liveV2.role.${group.role}`, { defaultValue: group.role })}</span><h3 className="break-all text-base font-semibold">{group.name}</h3>{parent ? <span className="text-xs text-muted-foreground">↳ {parent.name}</span> : null}</div>
      <div className="mt-3 space-y-2 border-l border-border pl-4">{group.events.map(event => {
        const meta = metadata(event)
        const category = kind(event)
        const subject = text(meta.subject ?? meta.tool_name ?? meta.tool_id ?? meta.operation ?? meta.status)
        const target = text(meta.to_manager_id ?? meta.target_agent_id ?? meta.target_id ?? meta.target)
        const thread = text(meta.thread_id)
        return <button type="button" key={event.sequence} onClick={() => setInspected(event)} className="flex w-full min-w-0 flex-wrap items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
          <span className="text-xs font-medium text-primary">{t(`liveV2.kind.${category}`)}</span><span className="break-all text-sm">{readable(event.type)}</span>
          {subject ? <span className="break-words text-xs text-muted-foreground">{subject}</span> : null}{target ? <span className="text-xs text-muted-foreground">→ {target}</span> : null}{thread ? <span className="font-mono text-xs text-muted-foreground">#{thread.slice(0, 8)}</span> : null}
          {typeof meta.duration_ms === "number" ? <span className="text-xs text-muted-foreground">{Math.round(meta.duration_ms)} ms</span> : null}
          <time className="ml-auto text-xs text-muted-foreground" title={event.created_at}>{new Date(event.created_at).toLocaleTimeString(i18n.language)}</time>
        </button>
      })}{group.transcripts.map((value, index) => <div key={index} className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm" aria-label={t("liveV2.liveText")}>{value}</div>)}</div>
    </section>})}</div> : <p className="py-8 text-sm text-muted-foreground">{t("liveV2.waitingEvents")}</p>}
    {threads.length ? <section className="border-t border-border py-4"><h3 className="text-sm font-semibold">{t("liveV2.collaborationThreads")}</h3><div className="mt-3 space-y-3">{threads.map(([id, events]) => <div key={id} className="rounded-md border border-border p-3"><p className="font-mono text-xs text-muted-foreground">#{id.slice(0, 8)}</p>{events.map(event => {
      const meta = metadata(event)
      return <p key={event.sequence} className="mt-2 break-words text-sm">{event.agent_name ?? event.agent_id ?? t("liveV2.system")} → {text(meta.to_manager_id ?? meta.target_agent_id ?? meta.target_id ?? meta.target) ?? "—"}: {text(meta.subject) ?? readable(event.type)}</p>
    })}</div>)}</div></section> : null}
    {model.dropped ? <p className="text-xs text-warning">{t("liveV2.transientGap")}</p> : null}
    {inspected ? <aside className="mt-4 border-t border-border pt-4"><div className="flex justify-between"><h3 className="font-semibold">{t("liveV2.eventInspector")}</h3><button className="text-sm text-primary" onClick={() => setInspected(null)}>{t("liveV2.close")}</button></div><p className="mt-2 text-xs">#{inspected.sequence} · {inspected.type} · {inspected.created_at}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(inspected.payload, null, 2)}</pre></aside> : null}
  </section>
}
