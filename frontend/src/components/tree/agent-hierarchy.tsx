import { Bot, GitBranch, Pencil, Wrench } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { AgentDraft, ProviderConnection, ProviderModel, ToolConnection, TreeDetail } from "@/lib/api"

interface Props {
  canEdit?: boolean
  tree: TreeDetail
  providers: ProviderConnection[]
  models: ProviderModel[]
  tools: ToolConnection[]
}

/** A contained canvas: wide hierarchies scroll inside the card, never the page. */
export function AgentHierarchy({ tree, providers, models, tools, canEdit = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<AgentDraft | null>(null)
  const origin = useRef<HTMLButtonElement | null>(null)
  const canvas = useRef<HTMLDivElement | null>(null)
  const agents = tree.version.agents
  const root = agents.find(agent => agent.agent_type === "root")
  const managers = agents.filter(agent => agent.agent_type === "manager" && agent.parent_agent_id === root?.id)
  const assigned = selected ? tools.filter(tool => tree.version.tool_assignments.some(item => item.agent_config_id === selected.id && item.tool_connection_id === tool.id)) : []
  const provider = providers.find(item => item.id === selected?.provider_connection_id)
  const model = models.find(item => item.provider_connection_id === selected?.provider_connection_id && item.model_id === selected?.model_id)
  const parent = agents.find(item => item.id === selected?.parent_agent_id)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const center = () => { element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2) }
    center()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(center)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tree.id])

  function node(agent: AgentDraft) {
    const role = t(`agents.${agent.agent_type}`)
    return <button
      key={agent.id}
      type="button"
      aria-label={`${agent.name}, ${role}. ${t("common.details")}`}
      onClick={event => { origin.current = event.currentTarget; setSelected(agent) }}
      className="agent-node"
      data-agent-id={agent.id}
      data-parent-id={agent.parent_agent_id ?? undefined}
      data-role={agent.agent_type}
      aria-expanded={selected?.id === agent.id}
      aria-haspopup="dialog"
      onKeyDown={event => {
        const nodes = [...event.currentTarget.closest("[data-testid=tree-canvas]")!.querySelectorAll<HTMLButtonElement>(".agent-node")]
        const index = nodes.indexOf(event.currentTarget)
        let target: HTMLButtonElement | undefined
        if (event.key === "ArrowRight") target = nodes[index + 1]
        if (event.key === "ArrowLeft") target = nodes[index - 1]
        if (event.key === "ArrowUp") target = nodes.find(item => item.dataset.agentId === agent.parent_agent_id)
        if (event.key === "ArrowDown") target = nodes.find(item => item.dataset.parentId === agent.id)
        if (event.key === "Home") target = nodes[0]
        if (event.key === "End") target = nodes.at(-1)
        if (target) { event.preventDefault(); target.focus() }
      }}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-earth">{agent.agent_type === "manager" ? <GitBranch className="size-4" /> : <Bot className="size-4" />}</span>
      <span className="min-w-0"><span className="block text-xs text-muted-foreground">{role}</span><span className="line-clamp-2 break-words text-sm font-medium leading-5" title={agent.name}>{agent.name}</span></span>
    </button>
  }

  return <>
    <section className="min-w-0" aria-label={t("agents.hierarchy")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{t("agents.hierarchy")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("treeV3.selectAgent")}</p></div><Badge variant="secondary">{agents.length} {t("trees.agents")}</Badge></div>
      {root ? <div ref={canvas} className="topology overflow-x-auto border-y border-border" data-testid="tree-canvas">
        <ul aria-label={t("agents.root")}><li>{node(root)}
          {managers.length ? <ul aria-label={t("agents.manager")}>{managers.map(manager => {
            const specialists = agents.filter(agent => agent.agent_type === "specialist" && agent.parent_agent_id === manager.id)
            return <li key={manager.id} data-branch={manager.id}>{node(manager)}
              {specialists.length ? <ul aria-label={manager.name}>{specialists.map(specialist => <li key={specialist.id}>{node(specialist)}</li>)}</ul> : null}
            </li>
          })}</ul> : null}
        </li></ul>
      </div> : <p className="py-8 text-sm text-muted-foreground">{t("treeV3.noRoot")}</p>}
    </section>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}>
      <DialogContent overlayClassName="bg-foreground/10" onCloseAutoFocus={event => { event.preventDefault(); origin.current?.focus() }} className="!left-auto !right-0 !top-0 !h-dvh !max-h-dvh !w-full !max-w-md !translate-x-0 !translate-y-0 !rounded-none border-y-0 border-r-0 p-6 sm:p-8" data-testid="agent-detail-drawer">
        {selected ? <><DialogHeader className="pr-8"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{t(`agents.${selected.agent_type}`)}</p><DialogTitle className="break-words text-2xl">{selected.name}</DialogTitle><DialogDescription>{selected.description || t(`agents.${selected.agent_type}Help`)}</DialogDescription></DialogHeader>
          <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted/50 p-4 text-sm"><Info label={t("designV3.parent")} value={parent?.name ?? "—"} /><Info label={t("agents.provider")} value={provider?.name ?? "—"} /><Info label={t("agents.model")} value={model?.display_name || selected.model_id || "—"} /><Info label={t("agents.type")} value={t(`agents.${selected.agent_type}`)} /></dl>
          <section className="mt-6"><h3 className="text-sm font-semibold">{t("agents.capabilities")}</h3><div className="mt-2 flex flex-wrap gap-2">{selected.capabilities.length ? selected.capabilities.map(capability => <Badge key={capability} variant="secondary">{capability}</Badge>) : <span className="text-sm text-muted-foreground">{t("common.none")}</span>}</div></section>
          <section className="mt-6"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wrench className="size-4" />{t("agents.assignedTools")}</h3><div className="mt-2 flex flex-wrap gap-2">{assigned.length ? assigned.map(tool => <Badge key={tool.id} variant="secondary">{tool.name}</Badge>) : <span className="text-sm text-muted-foreground">{t("common.none")}</span>}</div></section>
          <section className="mt-6"><h3 className="text-sm font-semibold">{t("agents.systemInstruction")}</h3><p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/50 p-3 text-sm leading-6">{selected.system_instruction || t("agents.noInstruction")}</p></section>
          {canEdit ? <Button className="mt-6" variant="outline" onClick={() => navigate(`/trees/${tree.id}/edit?agent=${encodeURIComponent(selected.id)}`)}><Pencil className="size-4" />{t("treeV3.editAgent")}</Button> : null}
        </> : null}
      </DialogContent>
    </Dialog>
  </>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>
}
