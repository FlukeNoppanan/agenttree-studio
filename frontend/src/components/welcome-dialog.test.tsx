import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { WelcomeDialog } from "@/components/welcome-dialog"
import { AppTopbar } from "@/components/app-topbar"
import { snoozeWelcome, welcomeKey, welcomeSuppressed } from "@/lib/welcome"
import i18n from "@/i18n"
vi.mock("@/auth", () => ({ useAuth: () => ({ user: { id:"welcome-user",username:'Beginner',permissions:[] },can:()=>false }) }))
const now = new Date(2026,9,1,12,30).getTime()
function Location(){return <output data-testid="location">{useLocation().pathname}</output>}
function mount(){return render(<MemoryRouter initialEntries={['/trees']}><WelcomeDialog/><Location/></MemoryRouter>)}
beforeEach(async()=>{vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();await i18n.changeLanguage('en')})
afterEach(()=>vi.useRealTimers())
it('shows on entry and starts the existing tutorial',async()=>{
 mount();fireEvent.click(await screen.findByRole('button',{name:'Start Getting Started'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByTestId('location')).toHaveTextContent('/getting-started')
})
it('continues to Dashboard without creating permanent suppression',async()=>{
 const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Continue to Dashboard'}))
 expect(screen.getByTestId('location')).toHaveTextContent('/')
 expect(welcomeSuppressed('welcome-user')).toBe(false);view.unmount();mount();expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
it('does not navigate or persist when a snooze is merely selected',async()=>{
 mount();fireEvent.change(await screen.findByLabelText('Show this welcome again'),{target:{value:'7'}})
 expect(screen.getByTestId('location')).toHaveTextContent('/trees');expect(localStorage.getItem(welcomeKey('welcome-user'))).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Continue to Dashboard'}));expect(welcomeSuppressed('welcome-user')).toBe(true)
})
it('suppresses this session and shows after session storage is cleared',()=>{
 snoozeWelcome('welcome-user','session',now);expect(welcomeSuppressed('welcome-user',now)).toBe(true)
 sessionStorage.clear();expect(welcomeSuppressed('welcome-user',now)).toBe(false)
})
it('Today ends at local midnight, rather than 24 hours later',()=>{
 snoozeWelcome('welcome-user','today',now);const midnight=new Date(2026,9,2).getTime()
 expect(JSON.parse(localStorage.getItem(welcomeKey('welcome-user'))!)).toBe(midnight)
 expect(welcomeSuppressed('welcome-user',midnight-1)).toBe(true);expect(welcomeSuppressed('welcome-user',midnight)).toBe(false)
 expect(midnight-now).not.toBe(86_400_000)
})
it.each(['3','7','14'] as const)('expires the %s-day suppression exactly',choice=>{
 snoozeWelcome('welcome-user',choice,now);const end=now+Number(choice)*86_400_000
 expect(JSON.parse(localStorage.getItem(welcomeKey('welcome-user'))!)).toBe(end)
 expect(welcomeSuppressed('welcome-user',end-1)).toBe(true);expect(welcomeSuppressed('welcome-user',end)).toBe(false)
})
it('shows after an expired timestamp and ignores malformed/permanent values',async()=>{
 for(const value of ['{','"forever"','null','true',JSON.stringify(Date.now()+100*86_400_000)]){
 localStorage.setItem(welcomeKey('welcome-user'),value);expect(welcomeSuppressed('welcome-user')).toBe(false)
 }
 localStorage.setItem(welcomeKey('welcome-user'),String(Date.now()-1));mount();expect(await screen.findByRole('dialog')).toBeInTheDocument()
 expect(screen.getAllByRole('option').map(e=>e.textContent).join(' ')).not.toMatch(/never|forever/i)
})
it('keeps topbar Getting Started available when Welcome is snoozed',()=>{
 snoozeWelcome('welcome-user','session');render(<MemoryRouter><AppTopbar/><WelcomeDialog/></MemoryRouter>)
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getAllByRole('link',{name:'Getting Started'})[0]).toHaveAttribute('href','/getting-started')
})
it('isolates account preferences and survives unavailable storage',()=>{
 snoozeWelcome('another-user','7',now);expect(welcomeSuppressed('welcome-user',now)).toBe(false)
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked')})
 expect(welcomeSuppressed('welcome-user',now)).toBe(false)
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked')})
 expect(()=>snoozeWelcome('welcome-user','3',now)).not.toThrow()
})
it('switches Welcome EN/TH immediately using existing i18n',async()=>{
 mount();await screen.findByRole('dialog');await i18n.changeLanguage('th')
 expect(await screen.findByRole('heading',{name:'ยินดีต้อนรับสู่ AgentTree Studio'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'เปิด Getting Started'})).toBeInTheDocument()
 await i18n.changeLanguage('en');await waitFor(()=>expect(screen.getByRole('heading',{name:'Welcome to AgentTree Studio'})).toBeInTheDocument())
})
