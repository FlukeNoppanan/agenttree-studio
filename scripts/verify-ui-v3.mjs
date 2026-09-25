import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const artifacts = "/home/fluke/Agenttree-Studio/docs/verification-v3"
mkdirSync(artifacts, { recursive: true })
const profile = mkdtempSync(path.join(os.tmpdir(), "studio-chrome-"))
const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run", "--remote-allow-origins=*", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const username = `visual-smoke-${Date.now()}`
const password = "temporary-visual-smoke-password-2026"
let created = false

function backend(source, ...args) {
  const result = spawnSync("docker", ["compose", "exec", "-T", "backend", "python", "-c", source, ...args], { cwd: "/home/fluke/Agenttree-Studio", encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}

const setup = `
import sys
from backend.db.session import SessionLocal
from backend.models.auth import User
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tool import ToolConnection
from backend.services.auth_service import HASHER
with SessionLocal() as db:
    name, password = sys.argv[1:]
    db.add(User(username=name, username_key=name, password_hash=HASHER.hash(password), is_admin=True, is_active=True, must_change_password=False))
    db.add(User(username=name+'-member', username_key=name+'-member', password_hash=HASHER.hash(password), is_admin=False, is_active=True, must_change_password=False))
    provider = ProviderConnection(name=name+' Provider', provider_type='ollama', base_url='http://127.0.0.1:11434', status='connected')
    db.add(provider); db.flush()
    db.add(ProviderModel(provider_connection_id=provider.id, model_id='smoke-model', display_name='Disposable smoke model — extended reasoning and multilingual development model / โมเดลทดสอบชื่อยาว', is_available=True, generation_candidate=True, qualification_status='qualified'))
    db.add(ToolConnection(name=name+' Tool', tool_type='http_api', description='Disposable smoke tool — scoped workspace inspection for long multilingual technical descriptions. เครื่องมือทดสอบสำหรับตรวจสอบไฟล์ในพื้นที่ทำงานโดยไม่เปลี่ยนข้อมูลผู้ใช้', status='connected', enabled=True, config_json={'url': 'http://127.0.0.1:9', 'method': 'GET'}))
    db.commit()
`
const cleanup = `
import sys
from sqlalchemy import delete
from backend.db.session import SessionLocal
from backend.models.auth import User
from backend.models.provider import ProviderConnection
from backend.models.tool import ToolConnection
from backend.models.tree import Tree
with SessionLocal() as db:
    name = sys.argv[1]
    for tree in db.query(Tree).filter(Tree.name.like(name+'%')).all(): db.delete(tree)
    db.flush()
    db.execute(delete(ToolConnection).where(ToolConnection.name == name+' Tool'))
    db.execute(delete(ProviderConnection).where(ProviderConnection.name == name+' Provider'))
    db.execute(delete(User).where(User.username_key.in_([name, name+'-member'])))
    db.commit()
`

let socket
let sequence = 0
const pending = new Map()
function send(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}
async function until(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression).catch(() => false)) return
    await pause(200)
  }
  throw new Error(`Timeout: ${expression}`)
}
async function navigate(url) {
  await send("Page.navigate", { url })
  await until("document.readyState === 'complete'")
}
async function click(label, root = "document") {
  const found = await evaluate(`(() => { const root=${root}; const button=Array.from(root.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true })()`)
  if (!found) throw new Error(`Button missing: ${label}`)
  await pause(150)
}
async function clickTrusted(label) {
  const point = await evaluate(`(() => { const button=Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!button) return null; button.scrollIntoView({block:'center'}); const rect=button.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2} })()`)
  if (!point) throw new Error(`Trusted button missing: ${label}`)
  await send('Input.dispatchMouseEvent', {type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1})
  await pause(200)
}
async function fill(selector, value, root = "document") {
  const found = await evaluate(`(() => { const e=${root}.querySelector(${JSON.stringify(selector)}); if (!e) return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  if (!found) throw new Error(`Input missing: ${selector}`)
  await pause(100)
}
async function clickLabel(label) {
  const found = await evaluate(`(() => { const node=Array.from(document.querySelectorAll('label')).find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!node) return false; node.click(); return true })()`)
  if (!found) throw new Error(`Label missing: ${label}`)
  await pause(150)
}
async function selectOption(index, value, root = "document") {
  const found = await evaluate(`(() => { const e=${root}.querySelectorAll('select')[${index}]; if (!e) return false; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)
  if (!found) throw new Error(`Select ${index} missing`)
  await pause(150)
}
async function configureAgent(root, providerId) {
  await selectOption(0, providerId, root)
  await until(`${root}.querySelectorAll('select')[1]?.querySelector('option[value="smoke-model"]') !== null`)
  await selectOption(1, "smoke-model", root)
  await fill('input[placeholder="Add custom capability"]', "smoke-analysis", root)
  await click("Add", root)
}
async function screenshot(label, width, height = 900) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false })
  await pause(300)
  const metrics = await evaluate("({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, bodyText: document.body.innerText.slice(0, 220)})")
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    const offenders = await evaluate("Array.from(document.querySelectorAll('*')).filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(e => ({tag:e.tagName, className:String(e.className).slice(0,120), right:Math.round(e.getBoundingClientRect().right)}))")
    throw new Error(`OVERFLOW ${label} ${JSON.stringify(offenders)}`)
    if (label === "providers") console.log("PROVIDER ANCESTORS", JSON.stringify(await evaluate("(()=>{let e=document.querySelector('table');const a=[];while(e){const r=e.getBoundingClientRect();a.push({tag:e.tagName,className:String(e.className).slice(0,90),left:r.left,right:r.right,width:r.width,overflow:getComputedStyle(e).overflowX});e=e.parentElement}return a})()")))
  }
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
  writeFileSync(`${artifacts}/${label}-${width}.png`, Buffer.from(image.data, "base64"))
  console.log(`${label} ${width}px`, JSON.stringify(metrics))
}

try {
  backend(setup, username, password)
  created = true
  let port
  for (let i = 0; i < 50; i += 1) {
    try { port = readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; break } catch { await pause(100) }
  }
  if (!port) throw new Error("Chrome did not start")
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const target = targets.find(item => item.type === "page")
  socket = new WebSocket(target.webSocketDebuggerUrl)
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result)
  })
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }) })
  await send("Page.enable")
  await send("Runtime.enable")
  const origins = ["http://localhost:5173", "http://192.168.1.42:5173"]
  for (const [index, origin] of origins.entries()) {
    await navigate(`${origin}/login`)
    await until("document.body.innerText.includes('Sign In')")
    if (index === 0) for(const width of [1440,1024,768]) await screenshot("v3-en-login", width)
    if (index === 1) await screenshot("login-lan", 768)
    const login = await evaluate(`fetch('/api/auth/login', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({username:${JSON.stringify(username)}, password:${JSON.stringify(password)}})}).then(async r => ({status:r.status, body:await r.text()}))`)
    if (login.status !== 200) throw new Error(`Login failed ${JSON.stringify(login)}`)
    if (index === 0) {
      await navigate(`${origin}/account`)
      await until("document.querySelector('[role=tab]') !== null")
      await screenshot("account-profile", 1440)
      await screenshot("account-profile", 1024)
      await screenshot("account-profile", 768)
      await click("Security")
      await screenshot("account-security", 1024)
      await screenshot("account-security", 768)
      await click("Tree Access")
      await screenshot("account-tree-access", 1024)
      await screenshot("account-tree-access", 768)
      await click("API Keys")
      await until("document.body.innerText.includes('Create API Key')")
      await screenshot("account-api-keys", 1024)
      await screenshot("account-api-keys", 768)
      await click("Create API Key")
      await fill('input[placeholder="Coding IDE"]', 'Disposable browser key')
      await click("Create API Key", "document.querySelector('[role=dialog]')")
      await until("document.body.innerText.includes('API Key created')")
      await click("Hide")
      if (await evaluate("document.body.innerText.includes('ats_')")) throw new Error('Hidden API key remained visible')
      await click("Show")
      await clickTrusted("Copy API Key")
      console.log('API Key copy clicked', JSON.stringify(await evaluate("({copyError:document.body.innerText.includes('Could not copy'), clipboardAvailable:Boolean(navigator.clipboard)})")))
      await click("Done")
      if (await evaluate("document.body.innerText.includes('ats_')")) throw new Error('API key remained visible after Done')
      await evaluate("window.confirm = () => true")
      await click("Revoke API Key")
      await until("!document.body.innerText.includes('Disposable browser key')")
      console.log('API Key create/revoke browser flow passed')
      await navigate(`${origin}/my-trees`)
      await until("location.pathname === '/account' && location.search.includes('tree-access')")
      console.log('Legacy My Trees redirected', await evaluate('location.href'))
      await navigate(`${origin}/security-events`)
      await until("document.body.innerText.includes('Security Events') && document.querySelector('select option[value=api_token_created]') !== null")
      await screenshot("security-events", 1024)
      await screenshot("security-events", 768)
      await selectOption(0, 'api_token_created')
      await until("document.body.innerText.includes('API key created')")
      const detailButton = await evaluate("(() => { const button=document.querySelector('button[aria-label^=\"View details\"]'); if (!button) return false; button.click(); return true })()")
      if (!detailButton) throw new Error('Security Event detail button missing')
      await until("document.body.innerText.includes('Event details')")
      await screenshot("security-event-detail", 1024)
      await click('Close', "document.querySelector('[role=dialog]')")
      await click('Clear filters')
      await until("document.body.innerText.includes('Next')")
      await click('Next')
      await until("document.body.innerText.includes('Page 2 of')")
      console.log('Security Events filter/detail/pagination browser flow passed')
    }
    if (index === 1) {
      await evaluate("localStorage.setItem('agenttree-studio-language','th')")
      await navigate(`${origin}/account`)
      await until("document.body.innerText.includes('ข้อมูลบัญชี')")
      for (const label of ['ข้อมูลบัญชี', 'ความปลอดภัย', 'สิทธิ์เข้าถึง Tree', 'คีย์ API']) {
        await click(label)
        await screenshot(`account-th-${label === 'คีย์ API' ? 'keys' : label === 'ความปลอดภัย' ? 'security' : label === 'ข้อมูลบัญชี' ? 'profile' : 'trees'}`, 768)
      }
      await click('สร้างคีย์ API')
      await fill('input[placeholder="Coding IDE"]', 'Disposable LAN key')
      await click('สร้างคีย์ API', "document.querySelector('[role=dialog]')")
      await until("document.body.innerText.includes('สร้างคีย์ API แล้ว')")
      await clickTrusted('คัดลอกคีย์ API')
      const lanCopy = await evaluate("({error:document.body.innerText.includes('คัดลอกคีย์ API ไม่ได้'), clipboardAvailable:Boolean(navigator.clipboard)})")
      console.log('LAN API Key copy clicked', JSON.stringify(lanCopy))
      await click('เสร็จสิ้น')
      await evaluate('window.confirm = () => true')
      await click('เพิกถอนคีย์ API')
      await until("!document.body.innerText.includes('Disposable LAN key')")
      await evaluate("localStorage.setItem('agenttree-studio-language','en')")
    }
    await navigate(`${origin}/trees/new`)
    await until("document.body.innerText.includes('Create Tree')")
    const secure = await evaluate("({secure: isSecureContext, uuid: typeof crypto.randomUUID, error: document.body.innerText.includes('Unexpected Application Error')})")
    if (secure.error) throw new Error(`${origin} Wizard crashed`)
    console.log(`${origin}/trees/new`, JSON.stringify(secure))
    await screenshot(index === 0 ? "wizard-local" : "wizard-lan", 1440)
    if (index === 1) for (const width of [1024, 768]) await screenshot("wizard-lan", width)
    if (index === 1) {
      await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
      const providers = await evaluate("fetch('/api/providers').then(r => r.json())")
      const providerId = providers.find(item => item.name === username + " Provider")?.id
      if (!providerId) throw new Error("Disposable provider missing")
      await fill('input[placeholder="Network Operations Tree"]', username + " Tree")
      await click("Root Agent")
      await configureAgent("document", providerId)
      await click("Managers")
      await click("Add Manager")
      await until("document.querySelector('[role=dialog]') !== null")
      await configureAgent("document.querySelector('[role=dialog]')", providerId)
      await click("Save Agent", "document.querySelector('[role=dialog]')")
      await click("Specialists")
      await click("Add Specialist")
      await until("document.querySelector('[role=dialog]') !== null")
      await configureAgent("document.querySelector('[role=dialog]')", providerId)
      await click("Save Agent", "document.querySelector('[role=dialog]')")
      await click("Tools")
      const toolAssigned = await evaluate(`(() => { const label=Array.from(document.querySelectorAll('label')).find(e=>e.textContent.includes(${JSON.stringify(username + " Tool")})); if(!label) return false; const checkbox=label.querySelector('input[type=checkbox]'); if(!checkbox) return false; checkbox.click(); return checkbox.checked })()`)
      if (!toolAssigned) throw new Error("Disposable Tool was not assigned")
      await click("Review & Validate")
      await click("Save Draft")
      await until("location.pathname.match(/^\\/trees\\/[^/]+\\/edit$/) !== null")
      const treeId = await evaluate("location.pathname.split('/')[2]")
      const saved = await evaluate(`fetch('/api/trees/${treeId}').then(r=>r.json())`)
      if (saved.version.agents.length !== 3 || saved.version.tool_assignments.length !== 1) throw new Error("Wizard save did not persist full hierarchy and Tool assignment: " + JSON.stringify(saved.version))
      console.log("LAN Wizard saved", JSON.stringify({ treeId, agents: saved.version.agents.length, tools: saved.version.tool_assignments.length, models: saved.version.agents.map(a=>a.model_id) }))
      await click("Review & Validate")
      await click("Validate Draft")
      await until("document.body.innerText.includes('Tree validation passed.') || document.body.innerText.includes('Validation failed')")
      console.log("LAN Wizard validation", await evaluate("document.body.innerText.includes('Tree validation passed.') ? 'passed' : document.body.innerText.slice(-600)"))
      await click("Validate & Mark Ready")
      await until(`location.pathname === '/trees/${treeId}'`)
      await navigate(`${origin}/trees/${treeId}/edit`)
      await until("document.body.innerText.includes('Save Changes')")
      await click("Root Agent")
      await fill('input[id^="name-"]', "Edited Main Orchestrator")
      await click("Save Changes")
      await until("document.body.innerText.includes('Ready Tree updated and validated.')")
      const edited = await evaluate(`fetch('/api/trees/${treeId}').then(r=>r.json())`)
      if (edited.status !== "ready" || edited.version_number !== 2 || edited.root.name !== "Edited Main Orchestrator" || edited.version.tool_assignments.length !== 1) throw new Error("Ready Tree edit was not safely persisted: " + JSON.stringify(edited))
      console.log("LAN Ready Tree edit", JSON.stringify({ version: edited.version_number, status: edited.status, root: edited.root.name, assignments: edited.version.tool_assignments.length }))
      await navigate(`${origin}/users`)
      await until(`document.body.innerText.includes(${JSON.stringify(username + '-member')})`)
      const selectMember = async () => {
        const found = await evaluate(`(() => { const button=Array.from(document.querySelectorAll('button')).find(e => e.textContent.includes(${JSON.stringify(username + '-member')})); if (!button) return false; button.click(); return true })()`)
        if (!found) throw new Error('Disposable member missing from Users')
        await pause(200)
      }
      const memberAccess = async () => evaluate(`fetch('/api/users').then(r=>r.json()).then(rows=>{const user=rows.find(row=>row.username===${JSON.stringify(username + '-member')});return user && {permissions:user.permissions, mode:user.tree_access_mode, treeIds:user.allowed_tree_ids}})`)
      await selectMember()
      await clickLabel('Can use Trees')
      await clickLabel(username + ' Tree')
      await click('Save')
      await until(`document.body.innerText.includes(${JSON.stringify(username + '-member')})`)
      const selectedAccess = await memberAccess()
      if (!selectedAccess.permissions.includes('use_trees') || selectedAccess.mode !== 'selected' || !selectedAccess.treeIds.includes(treeId)) throw new Error('Selected Tree grant did not persist: '+JSON.stringify(selectedAccess))
      await selectMember()
      await clickLabel('All Trees')
      await click('Save')
      const allAccess = await memberAccess()
      if (allAccess.mode !== 'all') throw new Error('All Trees mode did not persist: '+JSON.stringify(allAccess))
      await selectMember()
      await clickLabel('Selected Trees')
      await click('Save')
      const restoredAccess = await memberAccess()
      if (restoredAccess.mode !== 'selected' || !restoredAccess.treeIds.includes(treeId)) throw new Error('Selected Trees mode did not restore: '+JSON.stringify(restoredAccess))
      await screenshot('users-tree-access', 1024)
      await screenshot('users-tree-access', 768)
      console.log('Users Selected → All → Selected browser flow passed')
      await navigate(`${origin}/trees`)
      await until(`document.body.innerText.includes(${JSON.stringify(username + " Tree")})`)
      await navigate(`${origin}/trees/${treeId}/edit`)
      await until("document.body.innerText.includes('Save Changes')")
      console.log("LAN Wizard persisted Tree reopened", treeId)
      await screenshot("wizard-reopened-lan", 1440)
      await navigate(`${origin}/trees/${treeId}`)
      await until(`document.body.innerText.includes(${JSON.stringify(username + " Tree")})`)
      await screenshot("tree-detail", 1024)
      await screenshot("tree-detail", 768)
      await evaluate("localStorage.setItem('agenttree-studio-language','th')")
      await navigate(`${origin}/trees/${treeId}`)
      await until("document.body.innerText.includes('แก้ไข Tree')")
      await screenshot("tree-detail-th", 1024)
      await screenshot("tree-detail-th", 768)
      await evaluate("localStorage.setItem('agenttree-studio-language','en')")
      await navigate(`${origin}/trees/${treeId}`)
      await until("document.body.innerText.includes('Edit Tree')")
      const nodeOpened = await evaluate("(() => { const node=document.querySelector('button[aria-label*=\"Edited Main Orchestrator\"]'); if(!node) return false; node.click(); return true })()")
      if (!nodeOpened) throw new Error("Agent node not found")
      await until("document.querySelector('[data-testid=agent-detail-drawer]') !== null")
      await screenshot("agent-drawer", 1024)
      await screenshot("agent-drawer", 768)
      await navigate(`${origin}/trees/${treeId}/live`)
      await pause(1500)
      console.log("LIVE DIAGNOSTIC", await evaluate("({url:location.href,text:document.body.innerText.slice(-700)})"))
      await until("document.body.innerText.includes('LIVE VIEW')")
      await screenshot("live-view", 1024)
      await screenshot("live-view", 768)

      // Real failed invocation against the disposable, unavailable local provider.
      // No external provider spending and no fabricated production activity.
      const testRun = await evaluate(`fetch('/api/trees/${treeId}/test-run', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:{task:'Disposable V3 browser verification — local unavailable provider'}})}).then(async r=>({status:r.status,body:await r.json()}))`)
      if(testRun.status !== 200 || !testRun.body.id) throw new Error('Disposable execution failed to persist')
      console.log('REAL DISPOSABLE RUN', JSON.stringify({id:testRun.body.id,status:testRun.body.status,events:testRun.body.trace.length}))
      const topology = await evaluate(`fetch('/api/trees',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:${JSON.stringify(username+' Topology')},description:'Disposable layout stress fixture / ทดสอบโครงสร้างหลายสาขา',agents:[{id:'root',agent_type:'root',name:'Delivery Orchestrator / ผู้ประสานงานหลัก',capabilities:['planning']},...['Backend','Frontend','Review'].flatMap((team,index)=>[{id:'manager-'+index,agent_type:'manager',parent_agent_id:'root',name:team+' Manager',capabilities:['planning']},...['Implementation Specialist / ผู้พัฒนา','Quality & Security Specialist'].map((role,n)=>({id:'specialist-'+index+'-'+n,agent_type:'specialist',parent_agent_id:'manager-'+index,name:team+' '+role,capabilities:['coding']}))])]})}).then(async r=>({status:r.status,body:await r.json()}))`)
      if(topology.status!==201) throw new Error('Topology fixture creation failed')
      const pages = [['dashboard','/'],['trees','/trees'],['tree-detail','/trees/'+topology.body.id],['wizard','/trees/'+treeId+'/edit'],['templates','/templates'],['providers','/providers'],['tools','/tools'],['secrets','/secrets'],['runs','/runs'],['trace-list','/execution-trace'],['live','/trees/'+treeId+'/live'],['inspector','/runs/'+testRun.body.id],['users','/users'],['security-events','/security-events'],['account','/account'],['settings','/settings']]
      for(const language of ['en','th']) {
        await evaluate(`localStorage.setItem('agenttree-studio-language','${language}')`)
        for(const [name,route] of pages) {
          await navigate(origin+route)
          await until("document.querySelector('main h1') !== null")
          await pause(550)
          for(const width of [1440,1024,768]) await screenshot('v3-'+language+'-'+name,width)
          if(name==='tree-detail') {
            const count=await evaluate("document.querySelectorAll('.agent-node').length")
            if(count!==10) throw new Error('Hierarchy lost nodes')
            await evaluate("document.querySelector('.agent-node').focus()")
            await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
            await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
            if(await evaluate("document.activeElement.dataset.role")!=='manager') throw new Error('Keyboard hierarchy navigation failed')
            await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:"\r"})
            await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:"\r"})
            await until("document.querySelector('[data-testid=agent-detail-drawer]') !== null")
            for(const width of [1440,1024,768]) await screenshot('v3-'+language+'-agent-inspector',width)
            await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
            await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
            await until("document.querySelector('[data-testid=agent-detail-drawer]') === null")
            // Radix restores focus after the closing content unmounts, not in the same frame.
            await until("document.activeElement.dataset.role === 'manager'")
          }
          if(name==='providers') {
            await evaluate(`(() => { const row=Array.from(document.querySelectorAll('tbody tr')).find(row=>row.textContent.includes(${JSON.stringify(username+' Provider')})); row?.querySelector('button[aria-expanded=false]')?.click() })()`)
            await until("document.body.innerText.includes('extended reasoning')")
            for(const width of [1440,1024,768]) await screenshot('v3-'+language+'-ready-models',width)
          }
        }
      }
      await evaluate("localStorage.setItem('agenttree-studio-language','en')")
    }
    for (const [name, route] of [["dashboard", "/dashboard"], ["trees", "/trees"], ["templates", "/templates"], ["providers", "/providers"], ["tools", "/tools"], ["users", "/users"], ["account", "/account"], ["my-trees", "/my-trees"], ["security-events", "/security-events"]]) {
      await navigate(origin + route)
      await until("!document.body.innerText.includes('Loading…')")
      const result = await evaluate("({error: document.body.innerText.includes('Unexpected Application Error'), text: document.body.innerText.slice(0, 100)})")
      if (result.error) throw new Error(`${origin}${route} crashed`)
      if (index === 1) {
        if (name === "dashboard") await screenshot(name, 1440)
        await screenshot(name, 1024)
        await screenshot(name, 768)
      }
      console.log(`${origin}${route}`, JSON.stringify(result))
    }
  }
  await evaluate("fetch('/api/auth/logout',{method:'POST'})")
  await evaluate("localStorage.setItem('agenttree-studio-language','th')")
  await navigate(origins[1]+'/login')
  await until("document.querySelector('input[autocomplete=username]') !== null")
  for(const width of [1440,1024,768]) await screenshot('v3-th-login',width)
  console.log('V3 browser matrix and interaction checks passed')
} finally {
  socket?.close()
  chrome.kill()
  if (created) backend(cleanup, username)
  console.log("Disposable browser Admin removed")
}
