import {
  ArrowLeft,
  ArrowRight,
  FileInput,
  Plus,
  Play,
  Save,
  Trash2,
  Webhook,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { AgentEditorDialog } from "@/components/tree/agent-editor-dialog"
import { TestRunDialog } from "@/components/test-run-dialog"
import { AgentForm } from "@/components/tree/agent-form"
import { ManagerCard } from "@/components/tree/manager-card"
import { SpecialistCard } from "@/components/tree/specialist-card"
import { TreeSummary } from "@/components/tree/tree-summary"
import { ToolUseSettings } from "@/components/tree/tool-use-settings"
import {
  emptyAgent,
  emptyWizard,
  type ManualField,
  type WizardAgent,
  type WizardState,
  wizardFromTree,
  wizardPayload,
} from "@/components/tree/types"
import { ValidationPanel } from "@/components/tree/validation-panel"
import { WizardStepper } from "@/components/tree/wizard-stepper"
import { Notice } from "@/components/notice"
import { ToolStatusBadge } from "@/components/tools/tool-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  api,
  type ProviderConnection,
  type ToolConnection,
  type TreeDetail,
  type TreeValidation,
} from "@/lib/api"

const steps = ["General", "Root Agent", "Managers", "Specialists", "Tools", "Review & Validate"]

type Editor =
  | { kind: "manager"; managerIndex: number | null; value: WizardAgent }
  | { kind: "specialist"; managerIndex: number; specialistIndex: number | null; value: WizardAgent }
  | null

export function TreeWizard() {
  const { t } = useTranslation()
  const { treeId } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<WizardState>(emptyWizard)
  const [step, setStep] = useState(0)
  const [managerCursor, setManagerCursor] = useState(0)
  const [providers, setProviders] = useState<ProviderConnection[]>([])
  const [tools, setTools] = useState<ToolConnection[]>([])
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(treeId ?? null)
  const [loading, setLoading] = useState(Boolean(treeId))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [validation, setValidation] = useState<TreeValidation | null>(null)
  const [runnableTree, setRunnableTree] = useState<TreeDetail | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      api.listProviders(),
      api.listTools(),
      treeId ? api.getTree(treeId) : Promise.resolve(null),
    ]).then(([providerItems, toolItems, tree]) => {
      if (!active) return
      setProviders(providerItems)
      setTools(toolItems)
      if (tree) {
        setState(wizardFromTree(tree))
        setCurrentTreeId(tree.id)
      }
    }).catch((error) => {
      if (active) setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load tree draft" })
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [treeId])

  function update(mutator: (current: WizardState) => WizardState) {
    setState(mutator)
    setDirty(true)
    setValidation(null)
  }

  async function saveDraft(showFeedback = true) {
    if (!state.name.trim()) {
      setStep(0)
      setNotice({ tone: "error", message: "Enter a Tree name before saving the draft." })
      return null
    }
    setSaving(true)
    try {
      const payload = wizardPayload(state)
      const saved = currentTreeId
        ? await api.saveTreeDraft(currentTreeId, payload)
        : await api.createTree(payload)
      setCurrentTreeId(saved.id)
      setDirty(false)
      if (!currentTreeId) navigate(`/trees/${saved.id}/edit`, { replace: true })
      if (showFeedback) setNotice({ tone: "success", message: "Draft saved." })
      return saved
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save draft" })
      return null
    } finally {
      setSaving(false)
    }
  }

  async function validate(markReady: boolean) {
    const saved = await saveDraft(false)
    if (!saved) return
    try {
      const result = await api.validateTree(saved.id, markReady)
      setValidation(result)
      if (result.valid) setRunnableTree(saved)
      if (result.valid && markReady) {
        setNotice({ tone: "success", message: "Tree passed validation and is now Ready." })
        navigate(`/trees/${saved.id}`)
      } else if (result.valid) {
        setNotice({ tone: "success", message: "Tree validation passed." })
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Validation failed" })
    }
  }

  function cancel() {
    if (!dirty || window.confirm("Leave this wizard? Unsaved changes will be lost.")) navigate("/trees")
  }

  function saveEditor() {
    if (!editor) return
    if (editor.kind === "manager") {
      update((current) => {
        const managers = [...current.managers]
        if (editor.managerIndex === null) managers.push({ agent: editor.value, specialists: [] })
        else managers[editor.managerIndex] = { ...managers[editor.managerIndex], agent: editor.value }
        return { ...current, managers }
      })
    } else {
      update((current) => {
        const managers = [...current.managers]
        const manager = { ...managers[editor.managerIndex], specialists: [...managers[editor.managerIndex].specialists] }
        if (editor.specialistIndex === null) manager.specialists.push(editor.value)
        else manager.specialists[editor.specialistIndex] = editor.value
        managers[editor.managerIndex] = manager
        return { ...current, managers }
      })
    }
    setEditor(null)
  }

  useEffect(() => {
    if (managerCursor >= state.managers.length) setManagerCursor(Math.max(0, state.managers.length - 1))
  }, [managerCursor, state.managers.length])

  const allAssignableAgents = useMemo(() => state.managers.flatMap((manager) => manager.specialists), [state.managers])

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>

  return (
    <div className="space-y-7">
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/15 bg-secondary/25 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("wizard.builder")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(currentTreeId ? "wizard.edit" : "wizard.create")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("wizard.description")}</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={cancel}>{t("common.cancel")}</Button><Button onClick={() => void saveDraft()} disabled={saving}><Save className="size-4" />{t(saving ? "wizard.saving" : "wizard.saveDraft")}</Button></div>
      </div>
      {notice ? <Notice {...notice} onDismiss={() => setNotice(null)} /> : null}
      <WizardStepper steps={(t("wizard.steps", { returnObjects: true }) as string[])} current={step} onSelect={setStep} />

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted/25"><CardTitle>{(t("wizard.steps", { returnObjects: true }) as string[])[step]}</CardTitle><CardDescription>{[
          "Name the Tree and select its starting template.",
          "Configure the single Root Agent that receives objectives and performs final review.",
          "Add capability-focused Managers. Specialists are configured in the next step.",
          "Add Specialists under each Manager.",
          "Assign connected executable Tools to eligible Specialists.",
          "Review the reusable runtime hierarchy and run readiness validation.",
        ][step]}</CardDescription></CardHeader>
        <CardContent>
          {step === 0 ? <GeneralStep state={state} update={update} /> : null}
          {step === 1 ? <AgentForm value={state.root} onChange={(root) => update((current) => ({ ...current, root }))} providers={providers} agentType="root" reviewLabel="Final Review enabled" /> : null}
          {step === 2 ? <ManagersStep state={state} update={update} openEditor={setEditor} /> : null}
          {step === 3 ? <SpecialistsStep state={state} update={update} managerCursor={managerCursor} setManagerCursor={setManagerCursor} openEditor={setEditor} /> : null}
          {step === 4 ? <ToolsStep agents={allAssignableAgents} tools={tools} updateAgent={(agent) => update((current) => ({ ...current, managers: current.managers.map((manager) => manager.agent.id === agent.id ? { ...manager, agent } : { ...manager, specialists: manager.specialists.map((specialist) => specialist.id === agent.id ? agent : specialist) }) }))} /> : null}
          {step === 5 ? <div className="space-y-6"><TreeSummary state={state} providers={providers} tools={tools} /><ValidationPanel validation={validation} /><div className="flex flex-wrap justify-end gap-3">{validation?.valid && runnableTree ? <Button variant="outline" onClick={() => setTestOpen(true)}><Play className="size-4" />Test Run</Button> : null}<Button variant="outline" onClick={() => void validate(false)} disabled={saving}>Validate Draft</Button><Button onClick={() => void validate(true)} disabled={saving}>Validate & Mark Ready</Button></div></div> : null}
        </CardContent>
      </Card>

      <div className="flex justify-between"><Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ArrowLeft className="size-4" />{t("wizard.back")}</Button><Button variant="outline" disabled={step === steps.length - 1} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>{t("wizard.next")}<ArrowRight className="size-4" /></Button></div>

      <AgentEditorDialog
        open={editor !== null}
        title={editor?.kind === "manager" ? "Manager" : "Specialist"}
        description={editor?.kind === "manager" ? "Configure a capability-focused routing and review layer." : "Configure a worker assigned to this Manager."}
        value={editor?.value ?? null}
        providers={providers}
        tools={tools}
        agentType={editor?.kind === "manager" ? "manager" : "specialist"}
        reviewLabel={editor?.kind === "manager" ? "Manager Review enabled" : undefined}
        onChange={(value) => setEditor((current) => current ? { ...current, value } : null)}
        onSave={saveEditor}
        onOpenChange={(open) => { if (!open) setEditor(null) }}
      />
      {runnableTree ? <TestRunDialog tree={runnableTree} open={testOpen} onOpenChange={setTestOpen} /> : null}
    </div>
  )
}

function GeneralStep({ state, update }: { state: WizardState; update: (fn: (state: WizardState) => WizardState) => void }) {
  return <div className="space-y-5"><div className="space-y-2"><Label>Tree Name</Label><Input value={state.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} placeholder="Network Operations Tree" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={state.description} onChange={(event) => update((current) => ({ ...current, description: event.target.value }))} /></div><div className="space-y-2"><Label>Template</Label><Select value={state.template} onChange={(event) => update((current) => ({ ...current, template: event.target.value }))}><option value="blank">Blank Tree</option></Select><p className="text-xs text-muted-foreground">Template support is extensible; only Blank Tree is available now.</p></div></div>
}

function ManagersStep({ state, update, openEditor }: { state: WizardState; update: (fn: (state: WizardState) => WizardState) => void; openEditor: (editor: Editor) => void }) {
  return <div className="space-y-4"><div className="flex justify-end"><Button type="button" onClick={() => openEditor({ kind: "manager", managerIndex: null, value: emptyAgent("New Manager") })}><Plus className="size-4" />Add Manager</Button></div>{state.managers.length ? <div className="grid gap-4 lg:grid-cols-2">{state.managers.map((manager, index) => <ManagerCard key={manager.agent.id} manager={manager} onEdit={() => openEditor({ kind: "manager", managerIndex: index, value: { ...manager.agent } })} onDelete={() => { if (window.confirm(`Delete “${manager.agent.name}” and its Specialists?`)) update((current) => ({ ...current, managers: current.managers.filter((_, itemIndex) => itemIndex !== index) })) }} />)}</div> : <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No Managers yet. At least one is required for readiness.</p>}</div>
}

function SpecialistsStep({ state, update, managerCursor, setManagerCursor, openEditor }: { state: WizardState; update: (fn: (state: WizardState) => WizardState) => void; managerCursor: number; setManagerCursor: (index: number) => void; openEditor: (editor: Editor) => void }) {
  const manager = state.managers[managerCursor]
  if (!manager) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add a Manager before configuring Specialists.</p>
  return <div className="space-y-5"><div className="flex items-center justify-between rounded-lg bg-muted/40 p-4"><div><p className="text-xs text-muted-foreground">Manager {managerCursor + 1} / {state.managers.length}</p><p className="mt-1 font-semibold">{manager.agent.name}</p></div><div className="flex gap-2"><Button type="button" variant="outline" size="icon" disabled={managerCursor === 0} onClick={() => setManagerCursor(managerCursor - 1)}><ArrowLeft className="size-4" /></Button><Button type="button" variant="outline" size="icon" disabled={managerCursor === state.managers.length - 1} onClick={() => setManagerCursor(managerCursor + 1)}><ArrowRight className="size-4" /></Button></div></div><div className="flex justify-end"><Button type="button" onClick={() => openEditor({ kind: "specialist", managerIndex: managerCursor, specialistIndex: null, value: emptyAgent("New Specialist") })}><Plus className="size-4" />Add Specialist</Button></div><div className="space-y-3">{manager.specialists.map((specialist, specialistIndex) => <SpecialistCard key={specialist.id} specialist={specialist} onEdit={() => openEditor({ kind: "specialist", managerIndex: managerCursor, specialistIndex, value: { ...specialist } })} onDelete={() => update((current) => ({ ...current, managers: current.managers.map((item, index) => index === managerCursor ? { ...item, specialists: item.specialists.filter((_, targetIndex) => targetIndex !== specialistIndex) } : item) }))} />)}{manager.specialists.length === 0 ? <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">This Manager needs at least one Specialist.</p> : null}</div></div>
}

function ToolsStep({ agents, tools, updateAgent }: { agents: WizardAgent[]; tools: ToolConnection[]; updateAgent: (agent: WizardAgent) => void }) {
  if (!tools.length) return <div className="rounded-lg border border-dashed border-border p-8 text-center"><Wrench className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-medium">No Tool connections available</p><p className="mt-1 text-sm text-muted-foreground">Add and test an HTTP API or MCP connection on the Tools page first.</p></div>
  if (!agents.length) return <div className="rounded-lg border border-dashed border-border p-8 text-center"><Wrench className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-medium">No eligible Specialists</p><p className="mt-1 text-sm text-muted-foreground">Core Tool permissions bind to Specialist Agents. Add a Specialist before assigning Tools.</p></div>
  return <div className="space-y-5">{agents.map((agent) => <div key={agent.id} className="rounded-lg border border-border p-4"><p className="font-medium">{agent.name}</p><p className="mt-1 text-xs text-muted-foreground">Specialist</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{tools.map((tool) => {
    const usable = tool.enabled && tool.status === "connected" && (tool.tool_type !== "mcp" || tool.discovered_tools.some((item) => item.selected))
    const assigned = agent.tool_connection_ids.includes(tool.id)
    return <label key={tool.id} className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${usable ? "bg-muted/30" : "bg-muted/15 text-muted-foreground"}`}><span className="flex min-w-0 items-center gap-2"><input type="checkbox" className="accent-primary" disabled={!usable && !assigned} checked={assigned} onChange={(event) => {
      const tool_connection_ids = event.target.checked ? [...agent.tool_connection_ids, tool.id] : agent.tool_connection_ids.filter((id) => id !== tool.id)
      updateAgent({ ...agent, tool_connection_ids, autonomous_tool_use: tool_connection_ids.length ? agent.autonomous_tool_use : false })
    }} /><span className="truncate">{tool.name}</span></span><ToolStatusBadge status={tool.status} /></label>
  })}</div><div className="mt-4"><ToolUseSettings value={agent} tools={tools} onChange={updateAgent} /></div></div>)}</div>
}

function TriggerStep({ state, update, treeId }: { state: WizardState; update: (fn: (state: WizardState) => WizardState) => void; treeId: string | null }) {
  function updateField(index: number, patch: Partial<ManualField>) { update((current) => ({ ...current, manualFields: current.manualFields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } : field) })) }
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => update((current) => ({ ...current, triggerType: "manual_form" }))} className={`rounded-lg border p-4 text-left ${state.triggerType === "manual_form" ? "border-primary bg-primary/5" : "border-border"}`}><FileInput className="size-5" /><p className="mt-2 font-medium">Manual Form</p><p className="mt-1 text-xs text-muted-foreground">Collect configured fields in Studio.</p></button><button type="button" onClick={() => update((current) => ({ ...current, triggerType: "webhook" }))} className={`rounded-lg border p-4 text-left ${state.triggerType === "webhook" ? "border-primary bg-primary/5" : "border-border"}`}><Webhook className="size-5" /><p className="mt-2 font-medium">Webhook</p><p className="mt-1 text-xs text-muted-foreground">Reserve a Tree-specific POST route. Execution is deferred.</p></button></div>{state.triggerType === "manual_form" ? <div className="space-y-3"><div className="flex justify-between"><div><p className="font-medium">Form fields</p><p className="text-xs text-muted-foreground">Text, textarea, number, select, and file are supported.</p></div><Button type="button" variant="outline" onClick={() => update((current) => ({ ...current, manualFields: [...current.manualFields, { id: crypto.randomUUID(), name: "", type: "text", required: false, options: [] }] }))}><Plus className="size-4" />Add Field</Button></div>{state.manualFields.map((field, index) => <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[1fr_160px_auto_auto]"><Input value={field.name} onChange={(event) => updateField(index, { name: event.target.value })} placeholder="Field label" /><Select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as ManualField["type"] })}><option value="text">Text</option><option value="textarea">Textarea</option><option value="number">Number</option><option value="select">Select</option><option value="file">File</option></Select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} className="accent-primary" />Required</label><Button type="button" variant="ghost" size="icon" onClick={() => update((current) => ({ ...current, manualFields: current.manualFields.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="size-4" /></Button>{field.type === "select" ? <Input className="sm:col-span-4" value={field.options.join(", ")} onChange={(event) => updateField(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Options separated by commas" /> : null}</div>)}</div> : <div className="rounded-lg border border-border bg-muted/25 p-4"><p className="text-sm font-medium">Generated after save</p><p className="mt-1 font-mono text-xs text-muted-foreground">POST /api/trees/{treeId ?? "{tree_id}"}/webhook</p><p className="mt-2 text-xs text-muted-foreground">This phase stores route configuration only; it does not execute the Tree.</p></div>}</div>
}

function OutputStep({ state, update }: { state: WizardState; update: (fn: (state: WizardState) => WizardState) => void }) {
  return <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label>Output type</Label><Select value={state.outputType ?? ""} onChange={(event) => update((current) => ({ ...current, outputType: event.target.value as WizardState["outputType"] }))}><option value="text">Text</option><option value="structured_json">Structured JSON</option></Select></div><div className="space-y-2"><Label>Delivery</Label><Select value={state.deliveryType ?? ""} onChange={(event) => update((current) => ({ ...current, deliveryType: event.target.value as WizardState["deliveryType"] }))}><option value="show_in_web">Show in web</option><option value="api_response">API response</option></Select></div></div>
}
