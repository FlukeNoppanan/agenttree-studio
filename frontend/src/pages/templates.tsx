import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, Boxes, Eye, Pencil, Trash2, Users } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{builtInKey ? t(`${builtInKey}.agents.${agent.key}.name`, { defaultValue: agent.name }) : agent.name}</span><Badge variant="secondary">{agent.role || t(`templatesV3.roles.${agent.agent_type}`)}</Badge></div>
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

  const grouped = useMemo(() => templates, [templates])
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
    setBusy(template.id)
    try {
      const tree = await api.instantiateTemplate(template.id)
      navigate(`/trees/${tree.id}/setup`)
    } catch (error) { setNotice({ tone: "error", message: error instanceof Error ? error.message : t("templatesV3.instantiateError") }) }
    finally { setBusy(null) }
  }

  return <div className="space-y-7">
    <PageHeader title={t("nav.templates")} description={t("templatesV3.description")} />
    {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-64 animate-pulse rounded-xl border border-border bg-muted/30" />)}</div> : grouped.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {grouped.map(template => <Card key={template.id} className="flex min-w-0 flex-col">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Boxes className="size-5" /></span><Badge variant={template.template_type === "builtin" ? "secondary" : "info"}>{t(`templatesV3.types.${template.template_type}`)}</Badge></div>
          <div><CardTitle>{templateText(template, "name")}</CardTitle><CardDescription className="mt-1">{templateText(template, "description")}</CardDescription></div>
        </CardHeader>
        <CardContent className="mt-auto space-y-4">
          <div className="flex flex-wrap gap-2 text-xs"><Badge variant="secondary">{categoryName(template.category)}</Badge><Badge variant="secondary"><Users className="mr-1 size-3" />{t("templatesV3.agentsCount", { count: template.agent_count })}</Badge><Badge variant="secondary">{t("templatesV3.managersCount", { count: template.manager_count })}</Badge><Badge variant="secondary">{t("templatesV3.specialistsCount", { count: template.specialist_count })}</Badge></div>
          {(template.definition.tool_requirements ?? []).length ? <div><p className="text-xs font-medium text-muted-foreground">{t("templateSetupV1.requirements")}</p><div className="mt-1 flex flex-wrap gap-1.5">{template.definition.tool_requirements.map(tool => <Badge key={tool.id} variant={tool.requirement === "required" ? "warning" : "secondary"}>{toolDisplayName(tool.catalog_key)}</Badge>)}</div></div> : null}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={() => setPreview(template)}><Eye className="size-4" />{t("templatesV3.preview")}</Button>
            <Button size="sm" disabled={busy === template.id} onClick={() => void useTemplate(template)}>{t("templatesV3.use")}<ArrowRight className="size-4" /></Button>
            {template.template_type === "user" ? <><Button variant="ghost" size="sm" aria-label={t("templatesV3.edit")} onClick={() => openEdit(template)}><Pencil className="size-4" /></Button><Button variant="ghost" size="sm" aria-label={t("templatesV3.delete")} onClick={() => setDeleting(template)}><Trash2 className="size-4 text-destructive" /></Button></> : null}
          </div>
        </CardContent>
      </Card>)}
    </div> : <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("templatesV3.empty")}</div>}

    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null) }}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        {preview ? <><DialogHeader><DialogTitle>{templateText(preview, "name")}</DialogTitle><DialogDescription>{templateText(preview, "description")}</DialogDescription></DialogHeader>
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
