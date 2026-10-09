import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Check, Pencil, Plug, PlaySquare, EyeOff, LayoutGrid, Maximize, Minimize, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, Save, Search, Trash2, Undo2, Wrench } from 'lucide-react'
import { AgentRoleIcon } from '@/components/agent-role-icon'
import { useAuth } from '@/auth'
import { api, type AgentType, type ProviderConnection, type ProviderModel, type ToolConnection, type TreeDetail, type TreeValidation, type TreeTemplate } from '@/lib/api'
import { AgentForm } from '@/components/tree/agent-form'
import { agentPayload, fromAgent } from '@/components/tree/types'
import { BuilderCanvas, DRAG_TYPE, type PaletteItem } from '@/components/tree/builder/canvas'
import { addAgent, attachTool, autoLayout, connectAgents, deleteAgents, descendants, detachTool, layoutKey, newDocument, readLayout, resourceId, resourceToolId, treeDocument, writeLayout, type BuilderSnapshot, type Positions } from '@/components/tree/builder/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function TreeBuilderPage() {
  const { treeId } = useParams(), navigate = useNavigate(), { t, i18n } = useTranslation(), { user, can } = useAuth()
  const [query] = useSearchParams(), templateId = !treeId ? query.get('template') : null
  const [templateSource, setTemplateSource] = useState<TreeTemplate | null>(null), templateAgentIds = useRef<Record<string, string>>({})
  const [tree, setTree] = useState<TreeDetail | null>(null), [snapshot, setSnapshot] = useState<BuilderSnapshot>({ document: newDocument(), positions: {}, collapsed: [], hiddenResources: [] })
  const current = useRef(snapshot); current.current = snapshot
  const [baseline, setBaseline] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)
  const [modelCatalogs, setModelCatalogs] = useState<Record<string, ProviderModel[]> | undefined>()
  const [providers, setProviders] = useState<ProviderConnection[]>([]), [tools, setTools] = useState<ToolConnection[]>([])
  const [validation, setValidation] = useState<TreeValidation | null>(null), [checking, setChecking] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { setMessage('') }, [i18n.language])
  const [search, setSearch] = useState(''), [configure, setConfigure] = useState<string | null>(null), [selected, setSelected] = useState<string[]>([]), [remove, setRemove] = useState<string[] | null>(null)
  const [fitToken, setFitToken] = useState(0), [pulseTarget, setPulseTarget] = useState<string>(), [historyRevision, refreshHistory] = useState(0)
  const [view, setView] = useState({ componentsCollapsed: false, inspectorOpen: false, showTools: true, showMcp: true, focusCanvas: false })
  const viewKey = `agenttree:builder-view:v1:${user?.id ?? 'anonymous'}:${treeId ?? 'new'}`
  const history = useRef<{ past: BuilderSnapshot[]; future: BuilderSnapshot[] }>({ past: [], future: [] }), committed = useRef(snapshot)
  const dirty = baseline !== '' && JSON.stringify(snapshot.document) !== baseline
  const blocker = useBlocker(dirty && !saving)
  const key = tree && user ? layoutKey(user.id, tree.id, tree.current_version_id) : null
  const commit = useCallback((next: BuilderSnapshot, record = true) => {
    if (record && JSON.stringify(committed.current) !== JSON.stringify(next)) {
      history.current.past = [...history.current.past.slice(-99), structuredClone(committed.current)]; history.current.future = []
      committed.current = structuredClone(next); refreshHistory(v => v + 1)
    }
    current.current = next; setSnapshot(next)
  }, [])
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const result = treeId ? await api.getTree(treeId) : null
        const [providerResult, toolResult] = await Promise.allSettled([
          can('manage_providers_models') ? api.listProviders() : Promise.resolve([]),
          can('manage_tools_mcp') ? api.listTools() : Promise.resolve([]),
        ])
        if (!live) return
        if (providerResult.status === 'fulfilled') setProviders(providerResult.value)
        if (toolResult.status === 'fulfilled') setTools(toolResult.value)
        if (providerResult.status === 'rejected' || toolResult.status === 'rejected') setMessage(t('builder.resourceLoadFailed'))
        if (!can('manage_providers_models') && result) {
          const setup = await api.getTemplateSetup(result.id)
          if (!live) return
          setModelCatalogs(Object.fromEntries(setup.providers.map(p => [p.id, p.models])))
          setProviders(setup.providers.map(p => ({ id: p.id, name: p.name, provider_type: p.provider_type,
            status: 'connected', secret_id: null, base_url: null, last_checked_at: null, last_error: null,
            models_count: p.models.length, discovered_models_count: p.models.length, unavailable_models_count: 0,
            transient_models_count: 0, created_at: '', updated_at: '' })))
        }
        let document = result ? treeDocument(result) : newDocument()
        if (templateId) {
          const [prepared, source] = await Promise.all([api.getTemplateDraft(templateId), api.getTemplate(templateId)])
          if (!live) return
          document = prepared.configuration; templateAgentIds.current = prepared.agent_ids; setTemplateSource(source)
        } else { setTemplateSource(null); templateAgentIds.current = {} }
        const layout = result && user ? readLayout(layoutKey(user.id, result.id, result.current_version_id)) : { positions: {}, collapsed: [], hiddenResources: [] }
        const next = { document, positions: { ...autoLayout(document, Object.keys(layout.positions).filter(id => id.startsWith('resource:'))), ...layout.positions }, collapsed: layout.collapsed, hiddenResources: layout.hiddenResources }
        setConfigure(new URLSearchParams(window.location.search).get('agent')); setTree(result); setSnapshot(next); current.current = next; committed.current = structuredClone(next)
        setBaseline(JSON.stringify(document)); history.current = { past: [], future: [] }; setLoading(false)
      } catch { if (live) { setMessage(t('builder.loadFailed')); setLoading(false) } }
    }
    void load(); return () => { live = false }
    // Permissions and account remain stable for a mounted authenticated route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId, templateId, user?.id])
  useEffect(() => {
    if (loading) return
    if (!snapshot.document.name.trim()) {
      setChecking(false); setValidation({ valid: false, validated_at: new Date().toISOString(), errors: [{ step: 'general', code: 'tree_name_required', agent_id: null, message: t('builder.treeNameRequired') }] }); return
    }
    let live = true; setChecking(true); setValidation(null)
    const timeout = setTimeout(() => {
      void (templateId && !tree ? api.previewTemplateDraft(templateId, { configuration: snapshot.document, agent_ids: templateAgentIds.current }) : api.previewTreeDraft(snapshot.document, tree?.id)).then(result => { if (live) setValidation(result) }).catch(() => { if (live) setMessage(t('builder.validationFailed')) }).finally(() => { if (live) setChecking(false) })
    }, 450)
    return () => { live = false; clearTimeout(timeout) }
  }, [snapshot.document, tree?.id, loading, t])
  useEffect(() => { if (key) writeLayout(key, snapshot.positions, snapshot.collapsed, snapshot.hiddenResources ?? []) }, [key, snapshot.positions, snapshot.collapsed, snapshot.hiddenResources])
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(viewKey) ?? '{}')
      setView(current => ({ ...current, componentsCollapsed: value.componentsCollapsed === true, showTools: value.showTools !== false, showMcp: value.showMcp !== false }))
    } catch { /* Browser preferences are optional. */ }
  }, [viewKey])
  useEffect(() => { try { localStorage.setItem(viewKey, JSON.stringify({ componentsCollapsed: view.componentsCollapsed, showTools: view.showTools, showMcp: view.showMcp })) } catch { /* Browser preferences are optional. */ } }, [viewKey, view.componentsCollapsed, view.showTools, view.showMcp])
  useEffect(() => { const unload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload) }, [dirty])
  const undo = useCallback((redo = false) => {
    const source = redo ? history.current.future : history.current.past, target = redo ? history.current.past : history.current.future
    const next = source.pop(); if (!next) return; target.push(structuredClone(current.current)); committed.current = structuredClone(next); commit(next, false); refreshHistory(v => v + 1)
  }, [commit])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey) }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) { event.preventDefault(); setRemove(selected) }
      else if (event.key === 'Escape') { if (view.focusCanvas) setView(current => ({ ...current, focusCanvas: false })); setConfigure(null); setSelected([]); setView(current => ({ ...current, inspectorOpen: false })) }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard)
  }, [selected, undo, snapshot.document.agents, view.focusCanvas])
  const animation = useRef<number>(0)
  useEffect(() => () => cancelAnimationFrame(animation.current), [])
  const layout = () => {
    cancelAnimationFrame(animation.current)
    const origin = current.current, target = autoLayout(origin.document, Object.keys(origin.positions).filter(id => id.startsWith('resource:')))
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { commit({ ...origin, positions: target }); setFitToken(v => v + 1); return }
    const started = performance.now()
    const frame = (time: number) => {
      const elapsed = Math.min(1, (time - started) / 360), eased = 1 - Math.pow(1 - elapsed, 3), positions: Positions = {}
      for (const [id, point] of Object.entries(target)) { const from = origin.positions[id] ?? point; positions[id] = { x: from.x + (point.x - from.x) * eased, y: from.y + (point.y - from.y) * eased } }
      commit({ ...origin, positions }, false)
      if (elapsed < 1) animation.current = requestAnimationFrame(frame)
      else { commit({ ...origin, positions: target }); setFitToken(v => v + 1) }
    }
    animation.current = requestAnimationFrame(frame)
  }
  const drop = (item: PaletteItem, point: { x: number; y: number }, target?: string, fit = false) => {
    try {
      const previous = current.current
      const document = item.kind === 'agent' ? addAgent(previous.document, item.role, target ?? null) : target ? attachTool(previous.document, target, item.toolId) : previous.document
      const id = item.kind === 'agent' ? document.agents.at(-1)!.id : resourceId(item.toolId)
      const positions = { ...previous.positions, [id]: previous.positions[id] ?? point }
      const hiddenResources = (previous.hiddenResources ?? []).filter(resource => resource !== id)
      commit({ ...previous, document, positions, hiddenResources }); setSelected([id]); setView(current => ({ ...current, inspectorOpen: false })); setMessage('')
      if (fit) requestAnimationFrame(() => setFitToken(value => value + 1))
    } catch (error) { setMessage(t(`builder.${error instanceof Error ? error.message : 'invalidConnection'}`)) }
  }
  const connect = (source: string, target: string) => {
    try {
      const toolId = resourceToolId(target)
      const document = toolId ? source ? attachTool(current.current.document, source, toolId) : current.current.document : source ? connectAgents(current.current.document, source, target) : { ...current.current.document, agents: current.current.document.agents.map(a => a.id === target ? { ...a, parent_agent_id: null } : a) }
      if (toolId && !source) throw new Error('invalidConnection')
      commit({ ...current.current, document }); setPulseTarget(toolId ? `attachment:${source}:${toolId}` : `hierarchy:${target}`); setTimeout(() => setPulseTarget(undefined), 600); setMessage('')
    } catch { setMessage(t('builder.invalidConnection')) }
  }
  const disconnectResource = (agentId: string, toolId: string) => {
    commit({ ...current.current, document: detachTool(current.current.document, agentId, toolId) }); setMessage('')
  }
  const save = async (markReady = false) => {
    setSaving(true); setMessage('')
    try {
      const document = current.current.document
      let saved = tree ? tree.status === 'ready' ? await api.replaceReadyTree(tree.id, document) : await api.saveTreeDraft(tree.id, document) : templateId ? await api.instantiateTemplate(templateId, undefined, { configuration: document, agent_ids: templateAgentIds.current }) : await api.createTree(document)
      if (markReady && saved.status !== 'ready') { const result = await api.validateTree(saved.id, true); if (!result.valid) throw new Error(t('builder.needsSetup')); saved = await api.getTree(saved.id) }
      const nextDocument = treeDocument(saved), positions = tree?.status === 'ready' ? autoLayout(nextDocument, Object.keys(current.current.positions).filter(id => id.startsWith('resource:'))) : current.current.positions
      const next = { ...current.current, document: nextDocument, positions }
      setTree(saved); setBaseline(JSON.stringify(nextDocument)); committed.current = structuredClone(next); commit(next, false); history.current = { past: [], future: [] }; refreshHistory(v => v + 1)
      setMessage(t(tree?.status === 'ready' ? 'builder.savedVersion' : 'builder.saved')); if (!treeId) navigate(`/trees/${saved.id}/build`, { replace: true })
      return true
    } catch (error) { setMessage(error instanceof Error ? error.message : t('builder.saveFailed')); return false }
    finally { setSaving(false) }
  }
  const deleteSelection = (ids = remove ?? undefined) => {
    if (!ids) return
    const previous = current.current, agentIds = ids.filter(id => previous.document.agents.some(a => a.id === id))
    let document = deleteAgents(previous.document, agentIds)
    const hiddenResources = new Set(previous.hiddenResources ?? [])
    for (const id of ids) {
      if (id.startsWith('hierarchy:')) { const child = id.slice('hierarchy:'.length); document = { ...document, agents: document.agents.map(agent => agent.id === child ? { ...agent, parent_agent_id: null } : agent) } }
      else if (id.startsWith('attachment:')) { const [, agentId, ...toolParts] = id.split(':'); document = detachTool(document, agentId, toolParts.join(':')) }
      else if (resourceToolId(id)) hiddenResources.add(id)
    }
    commit({ ...previous, document, hiddenResources: [...hiddenResources] }); setConfigure(null); setSelected([]); setRemove(null)
  }
  const agent = snapshot.document.agents.find(a => a.id === configure)
  const state = checking ? t('builder.checking') : validation?.valid ? t('builder.readyToSave') : t('builder.needsSetup')
  const rootExists = snapshot.document.agents.some(a => a.agent_type === 'root')
  const inspectedId = selected.length === 1 ? selected[0] : null
  const inspectedAgent = inspectedId ? snapshot.document.agents.find(item => item.id === inspectedId) : undefined
  const inspectedToolId = inspectedId ? resourceToolId(inspectedId) : null
  const inspectedTool = inspectedToolId ? tools.find(item => item.id === inspectedToolId) : undefined
  const inspectedParent = inspectedAgent?.parent_agent_id ? snapshot.document.agents.find(item => item.id === inspectedAgent.parent_agent_id) : undefined
  const inspectedChildren = inspectedAgent ? snapshot.document.agents.filter(item => item.parent_agent_id === inspectedAgent.id) : []
  const inspectedAssignments = inspectedAgent ? snapshot.document.tool_assignments.filter(item => item.agent_config_id === inspectedAgent.id) : []
  const assignedAgents = inspectedToolId ? snapshot.document.tool_assignments.filter(item => item.tool_connection_id === inspectedToolId).map(item => snapshot.document.agents.find(agentItem => agentItem.id === item.agent_config_id)).filter(Boolean) : []
  const inspectedIssues = inspectedAgent ? (validation?.errors ?? []).filter(issue => issue.agent_id === inspectedAgent.id) : []
  if (!loading && !baseline) return <div className="space-y-4"><p role="alert">{message}</p><Button onClick={() => navigate('/trees')}>{t('builder.back')}</Button></div>
  if (loading) return <div role="status" className="p-8">{t('builder.loading')}</div>
  return <div className={`builder-page ${view.focusCanvas ? 'is-focus' : ''}`} data-history-revision={historyRevision}>
    <header className="builder-topbar"><Button variant="ghost" size="icon" aria-label={t('builder.back')} onClick={() => navigate(tree ? `/trees/${tree.id}` : '/trees')}><ArrowLeft size={18} /></Button><div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-widest text-primary">Visual Builder</div><Input className="mt-0.5 max-w-sm border-transparent bg-transparent px-2 text-base font-semibold" aria-label={t('builder.treeName')} value={snapshot.document.name} maxLength={160} required aria-invalid={!snapshot.document.name.trim()} onChange={e => commit({ ...snapshot, document: { ...snapshot.document, name: e.target.value } })} /></div><span className={`builder-readiness ${validation?.valid ? 'is-ready' : ''}`}>{validation?.valid ? <Check size={14} /> : <span className="size-2 rounded-full bg-warning" />}{state}</span><span className="builder-save-state">{dirty ? t('builder.unsaved') : !tree ? t('consolidation.unsavedDraft') : t('builder.savedState')}</span>{tree && can('view_executions') && <Button variant="outline" size="sm" onClick={() => navigate(`/trees/${tree.id}/playground`)}><PlaySquare size={14} />Playground</Button>}<Button variant="outline" size="sm" onClick={() => navigate(tree ? `/trees/${tree.id}/edit` : '/trees/new/advanced')}><Pencil size={14} />{t('builder.advanced')}</Button><Button variant="outline" size="sm" disabled={saving || !snapshot.document.name.trim()} onClick={() => void save()}><Save size={15} />{t('builder.save')}</Button><Button size="sm" disabled={saving || !snapshot.document.name.trim() || !validation?.valid || checking} onClick={() => void save(true)}><Check size={15} />{t('builder.validate')}</Button></header>
    <div className={`builder-workspace ${view.componentsCollapsed ? 'components-collapsed' : ''} ${selected.length && !view.inspectorOpen ? 'inspector-collapsed' : ''} ${!selected.length && !view.inspectorOpen ? 'inspector-absent' : ''}`}>
      <aside className="builder-palette">
        {view.componentsCollapsed ? <Button variant="ghost" size="icon" aria-label={t('builder.expandComponents')} title={t('builder.expandComponents')} onClick={() => setView(current => ({ ...current, componentsCollapsed: false }))}><PanelLeftOpen size={17} /></Button> : <>
          <div className="builder-panel-heading"><h2>{t('builder.components')}</h2><Button variant="ghost" size="icon" aria-label={t('builder.collapseComponents')} title={t('builder.collapseComponents')} onClick={() => setView(current => ({ ...current, componentsCollapsed: true }))}><PanelLeftClose size={16} /></Button></div>
          <div className="relative my-3"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" aria-label={t('builder.search')} placeholder={t('builder.search')} value={search} onChange={e => setSearch(e.target.value)} /></div>
          <p className="mb-3 text-xs leading-5 text-muted-foreground">{t('builder.paletteHelp')}</p>
          {templateSource && <details className="mb-3 border-y border-border py-2 text-xs"><summary className="cursor-pointer font-medium">{t('consolidation.templateDraft')}</summary><p className="mt-2 text-muted-foreground">{t('consolidation.saveTemplateHelp')}</p>{templateSource.definition.tool_requirements.map(requirement => <p key={requirement.id} className="mt-1 text-muted-foreground">{t(`templateSetupV1.packages.${requirement.catalog_key}.name`, { defaultValue: requirement.catalog_key })} · {t(`templateSetupV1.${requirement.requirement}`)}</p>)}</details>}
          <h3 className="builder-palette-section">Agents</h3>
          {(['root', 'manager', 'specialist'] as AgentType[]).filter(role => role.includes(search.toLowerCase())).map(role => <button key={role} className={`builder-palette-item builder-role-${role}`} disabled={role === 'root' && rootExists} draggable={!(role === 'root' && rootExists)} onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'agent', role })); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => { const count = snapshot.document.agents.filter(agentItem => agentItem.agent_type === role).length; drop({ kind: 'agent', role }, { x: role === 'root' ? 40 : 40 + count * 300, y: role === 'root' ? 40 : role === 'manager' ? 270 : 500 }, undefined, true) }}><AgentRoleIcon role={role} /><span className="capitalize">{role}</span>{role === 'root' && rootExists && <span className="ml-auto text-[10px] text-muted-foreground">{t('builder.rootExistsPalette')}</span>}</button>)}
          <div className="builder-palette-section-row"><h3 className="builder-palette-section">Resources</h3><span className="text-[10px] text-muted-foreground">{tools.length}</span></div>
          <label className="builder-filter"><input type="checkbox" checked={view.showTools} onChange={e => setView(current => ({ ...current, showTools: e.target.checked }))} /><span>{t('builder.showTools')}</span></label>
          <label className="builder-filter"><input type="checkbox" checked={view.showMcp} onChange={e => setView(current => ({ ...current, showMcp: e.target.checked }))} /><span>MCP</span></label>
          {tools.filter(tool => tool.name.toLowerCase().includes(search.toLowerCase())).map(tool => { const id = resourceId(tool.id), bound = snapshot.document.tool_assignments.some(binding => binding.tool_connection_id === tool.id), onCanvas = (snapshot.positions[id] !== undefined || bound) && !(snapshot.hiddenResources ?? []).includes(id); return <button key={tool.id} className={`builder-palette-item ${onCanvas ? 'is-on-canvas' : ''}`} draggable onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'tool', toolId: tool.id })); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => { const resources = Object.keys(snapshot.positions).filter(key => key.startsWith('resource:')); const fallback = autoLayout(snapshot.document, [...resources, id]); const agentRight = Math.max(0, ...snapshot.document.agents.map(agentItem => (snapshot.positions[agentItem.id]?.x ?? fallback[agentItem.id]?.x ?? 0) + 250)); const point = snapshot.positions[id] ?? { x: agentRight + 88, y: fallback[id]?.y ?? 0 }; drop({ kind: 'tool', toolId: tool.id }, point, undefined, true); setView(current => ({ ...current, [tool.tool_type === 'mcp' ? 'showMcp' : 'showTools']: true })) }}>{tool.tool_type === 'mcp' ? <Plug size={14} /> : <Wrench size={14} />}<span className="min-w-0 truncate text-xs">{tool.name}</span><span className="ml-auto text-[10px] text-muted-foreground">{onCanvas ? t('builder.onCanvas') : tool.tool_type === 'mcp' ? 'MCP' : 'Tool'}</span></button> })}
          {tools.length === 0 && <p className="text-xs leading-5 text-muted-foreground">{t('builder.optionalTools')}</p>}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">{t('builder.keyboardHelp')}</p>
        </>}
      </aside>
      <BuilderCanvas snapshot={snapshot} tools={tools} providers={providers} issues={validation?.errors ?? []} checked={Boolean(validation) && !checking} showTools={view.showTools} showMcp={view.showMcp} onPositions={(positions, finished) => { cancelAnimationFrame(animation.current); commit({ ...current.current, positions }, finished) }} onConnect={connect} onDisconnectResource={disconnectResource} onDrop={drop} onInspect={id => { setSelected([id]); setView(current => ({ ...current, inspectorOpen: true })) }} onCollapse={id => commit({ ...current.current, collapsed: current.current.collapsed.includes(id) ? current.current.collapsed.filter(v => v !== id) : [...current.current.collapsed, id] })} onReject={() => setMessage(t('builder.invalidConnection'))} onSelection={ids => { setSelected(ids); if (!ids.length) setView(current => ({ ...current, inspectorOpen: false })) }} selectedIds={selected} configuredId={configure} fitToken={fitToken} pulseTarget={pulseTarget} />
      <aside className={`builder-inspector ${!selected.length && !view.inspectorOpen ? 'is-absent' : view.inspectorOpen ? '' : 'is-collapsed'}`}>
        {!view.inspectorOpen ? <Button variant="ghost" size="icon" aria-label={t('builder.expandInspector')} title={t('builder.expandInspector')} onClick={() => setView(current => ({ ...current, inspectorOpen: true }))}><PanelRightOpen size={17} /></Button> : <>
          <div className="builder-panel-heading"><h2>{t('builder.inspector')}</h2><Button variant="ghost" size="icon" aria-label={t('builder.collapseInspector')} title={t('builder.collapseInspector')} onClick={() => setView(current => ({ ...current, inspectorOpen: false }))}><PanelRightClose size={16} /></Button></div>
          {inspectedAgent && <div className="builder-inspector-content"><div><p className={`builder-inspector-role builder-role-${inspectedAgent.agent_type}`}><AgentRoleIcon role={inspectedAgent.agent_type} />{inspectedAgent.agent_type}</p><h3 className="mt-1 text-lg font-semibold">{inspectedAgent.name}</h3></div>
            <div className="builder-inspector-section"><span>{t('builder.status')}</span><strong className={inspectedIssues.length ? 'text-warning' : ''}>{checking ? t('builder.checking') : inspectedIssues.length ? t('builder.needsSetup') : validation ? t('builder.configured') : t('builder.checking')}</strong></div>
            {inspectedParent && <div className="builder-inspector-section"><span>{t('builder.parent')}</span><strong>{inspectedParent.name}</strong></div>}
            {inspectedAgent.agent_type !== 'specialist' && <div className="builder-inspector-section"><span>{t('builder.childAgents')}</span><strong>{inspectedChildren.length}{inspectedChildren.length > 0 && <span className="block truncate font-normal text-muted-foreground">{inspectedChildren.map(child => child.name).join(', ')}</span>}</strong></div>}
            <div className="builder-inspector-section"><span>{t('builder.capabilities')}</span><div className="flex flex-wrap gap-1">{inspectedAgent.capabilities.length ? inspectedAgent.capabilities.map(capability => <span className="builder-inspector-chip" key={capability}>{capability}</span>) : <span className="text-muted-foreground">—</span>}</div></div>
            <div className="builder-inspector-section"><span>Provider / Model</span><strong>{providers.find(provider => provider.id === inspectedAgent.provider_connection_id)?.name ?? t('builder.noProvider')}<span className="block truncate font-normal text-muted-foreground">{inspectedAgent.model_id ?? t('builder.noModel')}</span></strong></div>
            <div className="builder-inspector-section"><span>Tools / MCP</span><div className="space-y-1">{inspectedAssignments.length ? inspectedAssignments.map(binding => <div key={binding.tool_connection_id} className="truncate">{tools.find(tool => tool.id === binding.tool_connection_id)?.name ?? t('builder.assignedTool')}</div>) : <span className="text-muted-foreground">—</span>}</div></div>
            {inspectedAgent.system_instruction && <details className="builder-inspector-section"><summary>{t('builder.instructions')}</summary><p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{inspectedAgent.system_instruction}</p></details>}
            {inspectedIssues.map((issue, index) => <p key={`${issue.code}-${index}`} className="rounded-lg bg-warning/10 p-2 text-xs text-warning">{t(`builder.issue.${issue.code}`, { defaultValue: issue.message, name: snapshot.document.agents.find(item => item.id === issue.agent_id)?.name ?? 'Agent' })}</p>)}
            <div className="mt-auto grid gap-2"><Button onClick={() => setConfigure(inspectedAgent.id)}>{t('builder.editAgent')}</Button><Button variant="outline" onClick={() => setRemove([inspectedAgent.id])}><Trash2 size={14} />{t('builder.delete')}</Button></div>
          </div>}
          {inspectedTool && <div className="builder-inspector-content"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">{inspectedTool.tool_type === 'mcp' ? 'MCP' : 'Tool'}</p><h3 className="mt-1 text-lg font-semibold">{inspectedTool.name}</h3></div>
            <div className="builder-inspector-section"><span>{t('builder.status')}</span><strong>{inspectedTool.enabled ? inspectedTool.status : t('builder.disabled')}</strong></div>
            {inspectedTool.tool_type === 'mcp' && <div className="builder-inspector-section"><span>{t('builder.transport')}</span><strong>{inspectedTool.transport_type ?? '—'}</strong></div>}
            <div className="builder-inspector-section"><span>{t('builder.assignedAgents')}</span><div className="space-y-1">{assignedAgents.length ? assignedAgents.map(item => <div key={item!.id}>{item!.name}</div>) : <span className="text-muted-foreground">{t('builder.notAssigned')}</span>}</div></div>
            {inspectedTool.tool_type === 'mcp' && <div className="builder-inspector-section"><span>{t('builder.discoveredTools')}</span><strong>{inspectedTool.discovered_tools.length}</strong></div>}
            <p className="text-xs leading-5 text-muted-foreground">{inspectedTool.description}</p>
            <div className="mt-auto grid gap-2"><Button asChild variant="outline"><Link to="/tools">{t('builder.openTools')}</Link></Button><Button variant="ghost" onClick={() => setRemove([inspectedId!])}><EyeOff size={14} />{t('builder.removeFromCanvas')}</Button></div>
          </div>}
          {!inspectedAgent && !inspectedTool && <div className="builder-inspector-content"><div><h3 className="font-semibold">{t('builder.relationship')}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{t('builder.relationshipHelp')}</p></div><Button variant="outline" disabled={!selected.length} onClick={() => setRemove(selected)}><Trash2 size={14} />{t('builder.removeRelationship')}</Button></div>}
        </>}
      </aside>
    </div>
    <footer className="builder-toolbar"><div className="flex flex-wrap items-center gap-1"><Button variant="ghost" size="sm" onClick={() => setFitToken(value => value + 1)}><Maximize size={14} />{t('builder.fit')}</Button><Button variant="ghost" size="sm" onClick={layout}><LayoutGrid size={14} />{t('builder.autoLayout')}</Button><Button variant="ghost" size="sm" disabled={!history.current.past.length} onClick={() => undo()}><Undo2 size={14} />{t('builder.undo')}</Button><Button variant="ghost" size="sm" disabled={!history.current.future.length} onClick={() => undo(true)}><Redo2 size={14} />{t('builder.redo')}</Button><Button variant="ghost" size="sm" disabled={!selected.length} onClick={() => setRemove(selected)}><Trash2 size={14} />{t('builder.delete')}</Button><Button variant="ghost" size="sm" onClick={() => setView(current => ({ ...current, focusCanvas: !current.focusCanvas }))}>{view.focusCanvas ? <Minimize size={14} /> : <Maximize size={14} />}{view.focusCanvas ? t('builder.exitFocus') : t('builder.focusCanvas')}</Button></div><div className="ml-auto flex items-center gap-3">{validation?.errors.length ? <details className="builder-issues"><summary className="cursor-pointer text-xs text-warning"><AlertTriangle size={14} className="mr-1 inline" aria-hidden="true" />{t('builder.validationIssues', { count: validation.errors.length })}</summary><div className="builder-issues-popover">{validation.errors.map((issue, index) => <button key={`${issue.code}-${index}`} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-60" disabled={!issue.agent_id} onClick={() => { setSelected([issue.agent_id!]); setView(current => ({ ...current, inspectorOpen: true })) }}>{t(`builder.issue.${issue.code}`, { defaultValue: issue.message, name: snapshot.document.agents.find(item => item.id === issue.agent_id)?.name ?? 'Agent' })}</button>)}</div></details> : <span className={`text-xs ${validation?.valid ? 'text-success' : 'text-muted-foreground'}`}>{state}</span>}<span className="hidden text-xs text-muted-foreground xl:block">{t('builder.localLayout')}</span></div></footer>
    {message && <div role="status" className="builder-feedback">{message}<button className="ml-4 rounded px-2" onClick={() => setMessage('')} aria-label={t('builder.close')}>×</button></div>}
    <Dialog open={Boolean(agent)} onOpenChange={open => { if (!open) setConfigure(null) }}><DialogContent className="builder-drawer"><DialogHeader><DialogTitle>{agent?.name} · {agent?.agent_type}</DialogTitle><DialogDescription>{t('builder.configHelp')}</DialogDescription></DialogHeader>{agent && <><AgentForm value={fromAgent(agent, new Map([[agent.id, snapshot.document.tool_assignments.filter(a => a.agent_config_id === agent.id).map(a => a.tool_connection_id)]]))} providers={providers} modelCatalogs={modelCatalogs} agentType={agent.agent_type} reviewLabel={agent.agent_type !== 'specialist' ? t('builder.review') : undefined} onChange={value => { const updated = agentPayload(value, agent.agent_type, agent.parent_agent_id); updated.settings = { ...agent.settings, ...updated.settings }; commit({ ...current.current, document: { ...current.current.document, agents: current.current.document.agents.map(a => a.id === agent.id ? updated : a) } }) }} />{agent.agent_type !== 'root' && <label className="mt-5 block text-sm">{t('builder.parent')}<select className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2" aria-label={t('builder.parent')} value={agent.parent_agent_id ?? ''} onChange={e => e.target.value ? connect(e.target.value, agent.id) : connect('', agent.id)}><option value="">{t('builder.unconnected')}</option>{snapshot.document.agents.filter(a => a.agent_type === (agent.agent_type === 'manager' ? 'root' : 'manager')).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{agent.agent_type === 'manager' && <fieldset className="mt-5 space-y-2"><legend className="mb-2 text-sm font-medium">{t('builder.peers')}</legend>{snapshot.document.agents.filter(a => a.agent_type === 'manager' && a.id !== agent.id).map(peer => <label key={peer.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(agent.settings?.allowed_manager_peer_ids) && agent.settings.allowed_manager_peer_ids.includes(peer.id)} onChange={e => { const peers = Array.isArray(agent.settings?.allowed_manager_peer_ids) ? agent.settings.allowed_manager_peer_ids as string[] : []; commit({ ...current.current, document: { ...current.current.document, agents: current.current.document.agents.map(a => a.id === agent.id ? { ...a, settings: { ...a.settings, allowed_manager_peer_ids: e.target.checked ? [...peers, peer.id] : peers.filter(id => id !== peer.id) } } : a) } }) }} />{peer.name}</label>)}</fieldset>}{agent.agent_type === 'specialist' && <details className="mt-5 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{t('builder.toolLoop')}</summary><label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(agent.settings?.autonomous_tool_use)} onChange={e => commit({ ...current.current, document: { ...current.current.document, agents: current.current.document.agents.map(a => a.id === agent.id ? { ...a, settings: { ...a.settings, autonomous_tool_use: e.target.checked } } : a) } })} />{t('builder.autonomousTools')}</label>{(['max_tool_iterations', 'max_tool_calls', 'tool_loop_timeout_seconds'] as const).map((field, index) => <label key={field} className="mt-3 block text-sm">{t(`builder.${['toolIterations','toolCalls','toolTimeout'][index]}`)}<Input className="mt-1" type="number" min={1} value={Number(agent.settings?.[field] ?? (index === 2 ? 60 : 5))} onChange={e => commit({ ...current.current, document: { ...current.current.document, agents: current.current.document.agents.map(a => a.id === agent.id ? { ...a, settings: { ...a.settings, [field]: Number(e.target.value) } } : a) } })} /></label>)}</details>}<fieldset className="mt-6 space-y-3"><legend className="mb-2 text-sm font-medium">Tools / MCP</legend>{tools.map(tool => <label key={tool.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={snapshot.document.tool_assignments.some(a => a.agent_config_id === agent.id && a.tool_connection_id === tool.id)} onChange={e => { const document = e.target.checked ? attachTool(current.current.document, agent.id, tool.id) : { ...current.current.document, tool_assignments: current.current.document.tool_assignments.filter(a => !(a.agent_config_id === agent.id && a.tool_connection_id === tool.id)) }; commit({ ...current.current, document, positions: { ...autoLayout(document), ...current.current.positions } }) }} />{tool.name} {tool.tool_type === 'mcp' && '(MCP)'}</label>)}</fieldset><DialogFooter><Button variant="outline" onClick={() => setRemove([agent.id])}><Trash2 size={14} />{t('builder.delete')}</Button><Button onClick={() => setConfigure(null)}>{t('builder.done')}</Button></DialogFooter></>}</DialogContent></Dialog>
    <Dialog open={Boolean(remove)} onOpenChange={open => { if (!open) setRemove(null) }}><DialogContent><DialogHeader><DialogTitle>{t((remove ?? []).some(id => snapshot.document.agents.some(a => a.id === id)) ? 'builder.deleteTitle' : (remove ?? []).some(id => id.startsWith('hierarchy:') || id.startsWith('attachment:')) ? 'builder.edgeDeleteTitle' : 'builder.resourceDeleteTitle')}</DialogTitle><DialogDescription>{t((remove ?? []).some(id => snapshot.document.agents.some(a => a.id === id)) ? 'builder.deleteHelp' : (remove ?? []).some(id => id.startsWith('hierarchy:') || id.startsWith('attachment:')) ? 'builder.edgeDeleteHelp' : 'builder.resourceDeleteHelp', { count: descendants(snapshot.document, (remove ?? []).filter(id => snapshot.document.agents.some(a => a.id === id))).size })}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRemove(null)}>{t('builder.cancel')}</Button><Button variant="destructive" onClick={() => deleteSelection()}>{t((remove ?? []).some(id => snapshot.document.agents.some(agentItem => agentItem.id === id)) ? 'builder.delete' : (remove ?? []).some(id => id.startsWith('hierarchy:') || id.startsWith('attachment:')) ? 'builder.removeRelationship' : 'builder.removeFromCanvas')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={blocker.state === 'blocked'} onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset() }}><DialogContent><DialogHeader><DialogTitle>{t('builder.unsaved')}</DialogTitle><DialogDescription>{t('builder.leaveHelp')}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => blocker.state === 'blocked' && blocker.reset()}>{t('builder.stay')}</Button><Button variant="ghost" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>{t('builder.discard')}</Button><Button onClick={async () => { if (await save() && blocker.state === 'blocked') blocker.proceed() }}>{t('builder.save')}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
