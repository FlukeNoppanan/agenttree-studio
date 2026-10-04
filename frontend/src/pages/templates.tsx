import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, Boxes, Eye, Pencil, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api, type TemplateMetadataPayload, type TreeTemplate } from "@/lib/api"

function AgentBranch({ template, parentKey, depth = 0 }: { template: TreeTemplate; parentKey: string | null; depth?: number }) {
  const { t } = useTranslation()
  const children = template.definition.agents.filter(agent => agent.parent_key === parentKey)
  const builtInKey = template.template_type === "builtin" ? `templatesV3.builtins.${template.id}` : null
  return <div className={depth ? "ml-5 border-l border-border pl-4" : "space-y-2"}>
    {children.map(agent => <div key={agent.key} className="space-y-2 py-1">
      <div className="rounded-lg border border-border bg-background/70 p-3">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{builtInKey ? t(`${builtInKey}.agents.${agent.key}.name`, { defaultValue: agent.name }) : agent.name}</span><Badge variant="secondary">{t(`templatesV3.roles.${agent.agent_type}`)}</Badge></div>
        <p className="mt-1 text-sm text-muted-foreground">{builtInKey ? t(`${builtInKey}.agents.${agent.key}.description`, { defaultValue: agent.description }) : agent.description}</p>
        {agent.capabilities.length ? <div className="mt-2 flex flex-wrap gap-1.5">{agent.capabilities.map(item => <Badge key={item} variant="secondary">{builtInKey ? t(`templatesV3.capabilities.${item.toLowerCase().replaceAll(" ", "-")}`, { defaultValue: item }) : item}</Badge>)}</div> : null}
      </div>
      <AgentBranch template={template} parentKey={agent.key} depth={depth + 1} />
    </div>)}
  </div>
}

export function TemplatesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<TreeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [difficulty, setDifficulty] = useState("all")
  const [category, setCategory] = useState("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<TreeTemplate | null>(null)
  const [editing, setEditing] = useState<TreeTemplate | null>(null)
  const [deleting, setDeleting] = useState<TreeTemplate | null>(null)
  const [form, setForm] = useState<TemplateMetadataPayload>({ name: "", description: "", category: "general" })
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setTemplates(await api.listTemplates()) }
    catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : t("templatesV3.loadError") }) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => templates.filter(template => {
    const localized = template.template_type === "builtin" ? t(`templatesV3.builtins.${template.id}.description`, { defaultValue: template.description }) : template.description
    const text = [template.name, template.description, localized, template.category, ...template.definition.agents.flatMap(agent => agent.capabilities)].join(" ").toLocaleLowerCase()
    return (!search.trim() || text.includes(search.trim().toLocaleLowerCase())) &&
      (difficulty === "all" || template.definition.metadata.difficulty === difficulty) &&
      (category === "all" || template.category === category)
  }), [templates, search, difficulty, category, t])
  const templateText = (template: TreeTemplate, field: "name" | "description") => template.template_type === "builtin"
    ? t(`templatesV3.builtins.${template.id}.${field}`, { defaultValue: template[field] })
    : template[field]
  const toolDisplayName = (key: string) => t(`templateSetupV1.packages.${key}.name`, { defaultValue: key })
  const toolDescription = (key: string, description: string) => t(`templateSetupV1.packages.${key}.description`, { defaultValue: description })
  const categoryName = (category: string) => t(`templatesV3.categories.${category}`, { defaultValue: category })
  function openEdit(template: TreeTemplate) {
    setEditing(template)
    setForm({ name: template.name, description: template.description, category: template.category })
  }
  async function saveEdit() {
    if (!editing) return
    setBusy(editing.id)
    try {
      const updated = await api.updateTemplate(editing.id, form)
      setTemplates(items => items.map(item => item.id === updated.id ? updated : item))
      setEditing(null)
      setNotice({ tone: "success", message: t("templatesV3.updated") })
    } catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : t("templatesV3.updateError") }) }
    finally { setBusy(null) }
  }
  async function deleteUserTemplate() {
    if (!deleting) return
    setBusy(deleting.id)
    try {
      await api.deleteTemplate(deleting.id)
      setTemplates(items => items.filter(item => item.id !== deleting.id))
      setDeleting(null)
      setNotice({ tone: "success", message: t("templatesV3.deleted") })
    } catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : t("templatesV3.deleteError") }) }
    finally { setBusy(null) }
  }
  async function useTemplate(template: TreeTemplate) {
    navigate(`/trees/new/visual?template=${encodeURIComponent(template.id)}`)
  }

  return <div className="space-y-4">
    <PageHeader title={t("nav.templates")} description={t("templatesV3.description")} />
    <p className="text-xs leading-5 text-muted-foreground">{t("onboarding.templatesHelp")}</p>
    <div className="flex flex-wrap gap-2" role="search" aria-label={t("ecosystem.templateFilters")}>
      <Input className="min-w-48 flex-1" aria-label={t("ecosystem.searchTemplates")} placeholder={t("ecosystem.searchTemplates")} value={search} onChange={event => setSearch(event.target.value)} />
      <select className="h-10 rounded-md border border-input bg-input px-3 text-sm" aria-label={t("ecosystem.difficultyLabel")} value={difficulty} onChange={event => setDifficulty(event.target.value)}>{["all", "beginner", "intermediate", "advanced"].map(value => <option key={value} value={value}>{t(`ecosystem.difficulty.${value}`)}</option>)}</select>
      <select className="h-10 rounded-md border border-input bg-input px-3 text-sm" aria-label={t("templatesV3.category")} value={category} onChange={event => setCategory(event.target.value)}><option value="all">{t("ecosystem.allCategories")}</option>{Array.from(new Set(templates.map(item => item.category))).sort().map(value => <option key={value} value={value}>{categoryName(value)}</option>)}</select>
      {(search || difficulty !== "all" || category !== "all") && <Button variant="ghost" onClick={() => { setSearch(""); setDifficulty("all"); setCategory("all") }}>{t("ecosystem.clearFilters")}</Button>}
    </div>
    {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
    {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-44 animate-pulse rounded-md border border-border bg-muted/30" />)}</div> : grouped.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {grouped.map(template => <article key={template.id} className="flex min-w-0 flex-col rounded-md border border-border bg-card p-3.5" aria-label={templateText(template, "name")}>
        <div className="flex items-center gap-2"><Boxes className="size-4 shrink-0 text-primary" /><h2 className="min-w-0 flex-1 text-sm font-semibold">{templateText(template, "name")}</h2><Badge variant="secondary">{t(`templatesV3.types.${template.template_type}`)}</Badge></div>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{templateText(template, "description")}</p>
        {typeof template.definition.metadata.difficulty === "string" && <div className="mt-2"><Badge variant="secondary">{t(`ecosystem.difficulty.${template.definition.metadata.difficulty}`)}</Badge></div>}
        <p className="mt-2 text-xs text-muted-foreground">{t("templatesV3.agentsCount", { count: template.agent_count })} · {t("templatesV3.managersCount", { count: template.manager_count })} · {t("templatesV3.specialistsCount", { count: template.specialist_count })}</p>
        <p className="mt-1 text-xs text-muted-foreground">{categoryName(template.category)}{template.definition.tool_requirements?.length ? ` · ${template.definition.tool_requirements.map(tool => toolDisplayName(tool.catalog_key)).join(' · ')}` : ''}</p>
        <div className="mt-auto flex flex-wrap justify-end gap-1 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setPreview(template)}><Eye className="size-3.5" />{t("templatesV3.preview")}</Button>
          <Button size="sm" onClick={() => void useTemplate(template)}>{t("templatesV3.use")}<ArrowRight className="size-3.5" /></Button>
          {template.template_type === "user" ? <><Button variant="ghost" size="sm" aria-label={t("templatesV3.edit")} onClick={() => openEdit(template)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="sm" aria-label={t("templatesV3.delete")} onClick={() => setDeleting(template)}><Trash2 className="size-3.5 text-destructive" /></Button></> : null}
        </div>
      </article>)}
    </div> : <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t(templates.length ? "ecosystem.noMatches" : "templatesV3.empty")}</div>}

    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null) }}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        {preview ? <><DialogHeader><DialogTitle>{templateText(preview, "name")}</DialogTitle><DialogDescription>{templateText(preview, "description")}</DialogDescription></DialogHeader>
          <section className="space-y-2 border-l-2 border-primary pl-3"><h3 className="text-sm font-semibold">{t("ecosystem.beforeStart")}</h3><p className="text-sm text-muted-foreground">{t("ecosystem.providerSetup")}</p><p className="text-sm text-muted-foreground">{t("ecosystem.scopeNote")}</p>{["outcome", "input_hint"].map(field => typeof preview.definition.metadata[field] === "string" ? <p key={field} className="text-sm"><strong>{t(`ecosystem.${field}`)}: </strong>{t(`templatesV3.builtins.${preview.id}.${field}`, { defaultValue: String(preview.definition.metadata[field]) })}</p> : null)}</section>
          <section className="space-y-3"><h3 className="text-sm font-semibold">{t("templatesV3.structure")}</h3><AgentBranch template={preview} parentKey={null} /></section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-border p-4"><h3 className="text-sm font-semibold">{t("templateSetupV1.requirements")}</h3>{(preview.definition.tool_requirements ?? []).length ? preview.definition.tool_requirements.map(tool => <div key={tool.id} className="mt-2"><div className="flex items-center gap-2"><p className="text-sm font-medium">{toolDisplayName(tool.catalog_key)}</p><Badge variant={tool.requirement === "required" ? "warning" : "secondary"}>{t(`templateSetupV1.${tool.requirement}`)}</Badge></div><p className="text-xs text-muted-foreground">{toolDescription(tool.catalog_key, tool.reason)}</p></div>) : <p className="mt-2 text-sm text-muted-foreground">{t("templatesV3.none")}</p>}</section>
            <section className="space-y-3 rounded-lg border border-border p-4"><div><h3 className="text-sm font-semibold">{t("templatesV3.input")}</h3><p className="text-sm text-muted-foreground">{preview.definition.trigger ? t(`templatesV3.triggerTypes.${preview.definition.trigger.trigger_type}`, { defaultValue: preview.definition.trigger.trigger_type }) : t("templatesV3.none")}</p></div><div><h3 className="text-sm font-semibold">{t("templatesV3.output")}</h3><p className="text-sm text-muted-foreground">{preview.definition.output ? `${t(`templatesV3.outputTypes.${preview.definition.output.output_type}`, { defaultValue: preview.definition.output.output_type })} · ${t(`templatesV3.deliveryTypes.${preview.definition.output.delivery_type}`, { defaultValue: preview.definition.output.delivery_type })}` : t("templatesV3.none")}</p></div></section>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>{t("common.close")}</Button><Button disabled={busy === preview.id} onClick={() => void useTemplate(preview)}>{t("templatesV3.use")}<ArrowRight className="size-4" /></Button></DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null) }}>
      <DialogContent><DialogHeader><DialogTitle>{t("templatesV3.edit")}</DialogTitle><DialogDescription>{t("templatesV3.editHelp")}</DialogDescription></DialogHeader>
        <div className="space-y-4"><div className="space-y-2"><Label htmlFor="template-name">{t("templatesV3.name")}</Label><Input id="template-name" value={form.name} onChange={event => setForm(item => ({ ...item, name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="template-category">{t("templatesV3.category")}</Label><Input id="template-category" value={form.category} onChange={event => setForm(item => ({ ...item, category: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="template-description">{t("templatesV3.descriptionField")}</Label><Textarea id="template-description" value={form.description} onChange={event => setForm(item => ({ ...item, description: event.target.value }))} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button disabled={!form.name.trim() || !form.category.trim() || busy === editing?.id} onClick={() => void saveEdit()}>{t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null) }}>
      <DialogContent><DialogHeader><DialogTitle>{t("templatesV3.deleteTitle")}</DialogTitle><DialogDescription>{t("templatesV3.deleteConfirm", { name: deleting?.name })}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={busy === deleting?.id} onClick={() => void deleteUserTemplate()}>{t("templatesV3.delete")}</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>
}
