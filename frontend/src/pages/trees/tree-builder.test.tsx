import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TreeBuilderPage } from './tree-builder'
import { CreateTreePage } from './create-tree'
import { api } from '@/lib/api'
import { addAgent, newDocument } from '@/components/tree/builder/model'
import i18n from '@/i18n'
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user' }, can: () => true }) }))
vi.mock('@/components/tree/builder/canvas', () => ({ DRAG_TYPE: 'application/agenttree-component', BuilderCanvas: (p: { snapshot: { document: { agents: { id: string; name: string }[] } }; tools?: { id: string; name: string }[]; readOnly?: boolean; onInspect: (id: string) => void }) => <div data-testid="canvas">{p.snapshot.document.agents.map(a => <button key={a.id} onClick={() => p.onInspect(a.id)}>{a.name}</button>)}{!p.readOnly && p.tools?.map(tool => <button key={tool.id} onClick={() => p.onInspect(`resource:${tool.id}`)}>{tool.name}</button>)}</div> }))
vi.mock('@/components/tree/agent-form', () => ({ AgentForm: () => <span>Shared AgentForm</span> }))
let document = addAgent(newDocument(), 'root')
function fixture() { return { id:'tree', name:document.name, description:'', template:'blank', status:'draft', current_version_id:'version', version:{ ...document, id:'version', status:'draft', agents: document.agents, tool_assignments:[] } } }
async function mount(path = '/trees/new/visual') { const router = createMemoryRouter([{ path:'/dashboard', element:<p>Dashboard context</p> }, { path:'/trees/new', element:<CreateTreePage /> }, { path:'/trees/new/visual', element:<TreeBuilderPage /> }, { path:'/trees/new/advanced', element:<p>Existing Wizard</p> }, { path:'/trees/:treeId/build', element:<TreeBuilderPage /> }, { path:'/trees/:treeId/edit', element:<p>Advanced route</p> }], { initialEntries:[path] }); render(<RouterProvider router={router} />); if (path.includes('/visual') || path.includes('/build')) await screen.findByText('Components'); return router }
beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage('en'); localStorage.clear(); document = addAgent(newDocument(), 'root'); vi.spyOn(api,'getTree').mockResolvedValue(fixture() as never); vi.spyOn(api,'listProviders').mockResolvedValue([]); vi.spyOn(api,'listTools').mockResolvedValue([]); vi.spyOn(api,'previewTreeDraft').mockResolvedValue({valid:false,errors:[],validated_at:''}) })
describe('Builder integration', () => {
  it('loads the canonical Template hierarchy without creating a Tree and validates source requirements', async () => {
    const source = { id:'builtin-general-analysis', name:'General Analysis', definition:{ tool_requirements:[] } }
    document = addAgent(document,'manager',document.agents[0].id)
    document = addAgent(document,'specialist',document.agents[1].id)
    const prepared = { configuration:document, agent_ids:{root:document.agents[0].id, manager:document.agents[1].id, specialist:document.agents[2].id} }
    vi.spyOn(api,'getTemplateDraft').mockResolvedValue(prepared)
    vi.spyOn(api,'getTemplate').mockResolvedValue(source as never)
    vi.spyOn(api,'previewTemplateDraft').mockResolvedValue({valid:false,errors:[],validated_at:''})
    const create = vi.spyOn(api,'instantiateTemplate')
    const router = await mount('/trees/new/visual?template=builtin-general-analysis')
    expect(screen.getByTestId('canvas')).toHaveTextContent('Specialist 1')
    await waitFor(() => expect(api.previewTemplateDraft).toHaveBeenCalledWith(source.id, prepared))
    expect(create).not.toHaveBeenCalled()
    expect(api.previewTreeDraft).not.toHaveBeenCalled()
    await act(async () => { await router.navigate('/dashboard') })
    expect(create).not.toHaveBeenCalled()
  })
  it('first Template Save persists the edited real configuration once with canonical Agent identities', async () => {
    const ids = {root:document.agents[0].id}
    vi.spyOn(api,'getTemplateDraft').mockResolvedValue({configuration:document,agent_ids:ids})
    vi.spyOn(api,'getTemplate').mockResolvedValue({id:'source',name:'Source',definition:{tool_requirements:[]}} as never)
    vi.spyOn(api,'previewTemplateDraft').mockResolvedValue({valid:false,errors:[],validated_at:''})
    vi.spyOn(api,'instantiateTemplate').mockResolvedValue(fixture() as never)
    await mount('/trees/new/visual?template=source')
    fireEvent.change(screen.getByLabelText('Tree name'),{target:{value:'Edited Template draft'}})
    fireEvent.click(screen.getByRole('button',{name:'Save'}))
    await waitFor(() => expect(api.instantiateTemplate).toHaveBeenCalledTimes(1))
    expect(api.instantiateTemplate).toHaveBeenCalledWith('source',undefined,{configuration:expect.objectContaining({name:'Edited Template draft',agents:document.agents}),agent_ids:ids})
  })
  it('new Tree remains empty until Root is explicitly added', async () => { await mount(); expect(screen.getByTestId('canvas')).toBeEmptyDOMElement(); fireEvent.click(screen.getByRole('button',{name:'root'})); expect(screen.getByTestId('canvas')).toHaveTextContent('Root 1'); expect(screen.getByRole('button',{name:/root.*Root already exists/i})).toBeDisabled(); expect(screen.getByText('Unsaved changes')).toBeVisible() })
  it('node selection opens the Inspector and explicit Edit reuses the shared form', async () => { await mount('/trees/tree/build'); fireEvent.click(screen.getByRole('button',{name:'Root 1'})); expect(await screen.findByRole('button',{name:'Edit Agent'})).toBeVisible(); fireEvent.click(screen.getByRole('button',{name:'Edit Agent'})); expect(await screen.findByText('Shared AgentForm')).toBeVisible() })
  it('shows role-specific parent and child details without entering Edit mode', async () => {
    document = addAgent(newDocument(),'root'); document = addAgent(document,'manager',document.agents[0].id); document = addAgent(document,'specialist',document.agents[1].id)
    vi.mocked(api.getTree).mockResolvedValue(fixture() as never)
    await mount('/trees/tree/build')
    fireEvent.click(screen.getByRole('button',{name:'Manager 1'}))
    expect(screen.getAllByText('Root 1').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Specialist 1').length).toBeGreaterThan(1)
    expect(screen.queryByText('Shared AgentForm')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Specialist 1'}))
    expect(screen.getAllByText('Manager 1').length).toBeGreaterThan(1)
  })
  it('shows safe shared Tool details and omits credentials and Secret identifiers', async () => {
    const rootId = document.agents[0].id, tree = fixture()
    ;(tree.version.tool_assignments as unknown as {agent_config_id:string;tool_connection_id:string}[]).push({agent_config_id:rootId,tool_connection_id:'tool-safe'})
    vi.mocked(api.getTree).mockResolvedValue(tree as never)
    vi.mocked(api.listTools).mockResolvedValue([{id:'tool-safe',name:'Safe API Tool',tool_type:'http_api',description:'Read-only endpoint',enabled:true,secret_id:'TEST_SECRET_ID',transport_type:null,status:'connected',configuration:{headers:{Authorization:'TEST_SECRET_VALUE'}},discovered_tools:[],assigned_agents_count:1,last_checked_at:null,last_error:null,created_at:'',updated_at:''}])
    await mount('/trees/tree/build')
    fireEvent.click(screen.getByRole('button',{name:'Safe API Tool'}))
    expect(await screen.findByText('Used by Agents')).toBeVisible()
    expect(screen.getAllByText('Root 1').length).toBeGreaterThan(1)
    expect(screen.queryByText(/TEST_SECRET/)).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Remove from Canvas'})).toBeVisible()
  })
  it('readiness uses the backend preview with Tree context', async () => { await mount('/trees/tree/build'); await waitFor(() => expect(api.previewTreeDraft).toHaveBeenCalledWith(expect.objectContaining({agents:document.agents}),'tree')); expect(screen.getByRole('button',{name:'Save & mark Ready'})).toBeDisabled() })
  it('shows backend readiness issues and valid status without fabricating Ready', async () => { vi.mocked(api.previewTreeDraft).mockResolvedValue({valid:true,errors:[],validated_at:''}); await mount('/trees/tree/build'); expect((await screen.findAllByText('Configuration valid'))[0]).toBeVisible(); expect(screen.getByRole('button',{name:'Save & mark Ready'})).toBeEnabled() })
  it('draft Save uses the existing version API and resets edit history', async () => { vi.spyOn(api,'saveTreeDraft').mockResolvedValue(fixture() as never); await mount('/trees/tree/build'); fireEvent.change(screen.getByLabelText('Tree name'),{target:{value:'Updated'}}); fireEvent.click(screen.getByRole('button',{name:'Save'})); await waitFor(() => expect(api.saveTreeDraft).toHaveBeenCalledWith('tree',expect.objectContaining({name:'Updated'}))); expect(await screen.findByText('Tree saved')).toBeVisible(); expect(screen.getByRole('button',{name:'Undo'})).toBeDisabled() })
  it('Undo/Redo restores canonical Tree configuration', async () => { await mount('/trees/tree/build'); fireEvent.change(screen.getByLabelText('Tree name'),{target:{value:'Changed'}}); fireEvent.click(screen.getByRole('button',{name:'Undo'})); expect(screen.getByLabelText('Tree name')).toHaveValue('Untitled Tree'); fireEvent.click(screen.getByRole('button',{name:'Redo'})); expect(screen.getByLabelText('Tree name')).toHaveValue('Changed') })
  it('guards Advanced Editor navigation while dirty', async () => { await mount('/trees/tree/build'); fireEvent.change(screen.getByLabelText('Tree name'),{target:{value:'Changed'}}); fireEvent.click(screen.getByRole('button',{name:'Advanced Editor'})); expect(await screen.findByText(/Save your configuration before leaving/)).toBeVisible(); fireEvent.click(screen.getByRole('button',{name:'Keep editing'})); expect(screen.queryByText('Advanced route')).not.toBeInTheDocument() })
  it('Thai keeps product terms and localizes instructions', async () => { await mount(); await act(() => i18n.changeLanguage('th')); expect(screen.getByRole('button',{name:'manager'})).toBeVisible(); expect(screen.getByText(/ลาก Agent และ Resource ลงบน Canvas/)).toBeVisible(); expect(screen.getByRole('button',{name:'บันทึก'})).toBeVisible(); expect(screen.queryByText(/ตัวแทน|ผู้จัดการ|ราก/)).not.toBeInTheDocument() })
  it('does not send an invalid blank Tree name to readiness preview', async () => {
    await mount('/trees/tree/build'); await waitFor(() => expect(api.previewTreeDraft).toHaveBeenCalled());
    vi.mocked(api.previewTreeDraft).mockClear(); fireEvent.change(screen.getByLabelText('Tree name'), { target: { value: '' } });
    expect(screen.getByLabelText('Tree name')).toHaveAttribute('aria-invalid','true');
    expect(screen.getByRole('button',{name:'Save'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Save & mark Ready'})).toBeDisabled();
    await new Promise(resolve => setTimeout(resolve, 550));
    expect(api.previewTreeDraft).not.toHaveBeenCalled();
  })

  it('clears translated transient feedback when language changes', async () => {
    vi.spyOn(api,'saveTreeDraft').mockResolvedValue(fixture() as never);
    await mount('/trees/tree/build'); await act(() => i18n.changeLanguage('th'));
    fireEvent.click(screen.getByRole('button',{name:'บันทึก'}));
    const notice=i18n.t('builder.saved'); expect(await screen.findByText(notice)).toBeVisible();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Save'})).toBeVisible();
  })
  it('lets users collapse both side panels to maximize the Canvas', async () => {
    await mount('/trees/tree/build')
    const workspace = () => globalThis.document.querySelector('.builder-workspace')
    fireEvent.click(screen.getByRole('button',{name:'Collapse Components panel'}))
    expect(workspace()).toHaveClass('components-collapsed')
    fireEvent.click(screen.getByRole('button',{name:'Root 1'}))
    expect(screen.getByRole('button',{name:'Collapse Inspector'})).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'Collapse Inspector'}))
    expect(workspace()).toHaveClass('inspector-collapsed')
    fireEvent.click(screen.getByRole('button',{name:'Expand Inspector'}))
    expect(screen.getByRole('heading',{name:'Inspector'})).toBeVisible()
  })

})

describe('Create Tree method selection', () => {
  it('returns to the previous page on Back without creating a draft', async () => {
    const createTree = vi.spyOn(api,'createTree')
    const router = await mount('/dashboard')
    await act(async () => { await router.navigate('/trees/new') })
    fireEvent.click(screen.getByRole('button',{name:'Back'}))
    expect(await screen.findByText('Dashboard context')).toBeVisible()
    expect(createTree).not.toHaveBeenCalled()
  })
  it('shows both creation methods and a specific Templates path without creating a Tree', async () => {
    const createTree = vi.spyOn(api,'createTree')
    const router = await mount('/trees/new')
    expect(screen.getByRole('heading',{name:'Create Tree'})).toBeVisible()
    expect(screen.getByRole('link',{name:'Open Visual Builder'})).toHaveAttribute('href','/trees/new/visual')
    expect(screen.getByRole('link',{name:'Start Guided Wizard'})).toHaveAttribute('href','/trees/new/advanced')
    expect(screen.getByRole('link',{name:'Browse Templates'})).toHaveAttribute('href','/templates')
    expect(createTree).not.toHaveBeenCalled()
    await act(async () => { await router.navigate('/trees/new/advanced') })
    expect(await screen.findByText('Existing Wizard')).toBeVisible()
  })
  it('localizes the creation choice while keeping product terms in Thai mode', async () => {
    await mount('/trees/new')
    await act(() => i18n.changeLanguage('th'))
    expect(screen.getByRole('heading',{name:'สร้าง Tree'})).toBeVisible()
    expect(screen.getByText(/ออกแบบ Tree บน Canvas โดยวาง Agent/)).toBeVisible()
    expect(screen.getByRole('link',{name:'เปิด Visual Builder'})).toBeVisible()
  })
})
