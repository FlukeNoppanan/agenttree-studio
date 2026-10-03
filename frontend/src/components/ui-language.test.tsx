import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import en from '@/locales/en/translation.json'
import th from '@/locales/th/translation.json'
import i18n from '@/i18n'
import { HttpToolConfig } from '@/components/tools/http-tool-config'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

beforeEach(async () => { await i18n.changeLanguage('en') })
function strings(value: unknown): string[] {
 if (typeof value === 'string') return [value]
 if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => key !== 'learning').flatMap(([, item]) => strings(item))
 return []
}
it('keeps the terminology policy throughout active Thai resource copy', () => {
 expect(strings(th).join('\n')).not.toMatch(/เทมเพลต|เอเจนต์|พรอไวเดอร์|โมเดล|ทูล|เว็บฮุก|แดชบอร์ด|แม่แบบ|ต้นไม้|ตัวแทน|ทรี|ร่องรอยการดำเนินการ|รัน/)
})
it('preserves recognizable technical names in Thai navigation and tutorial', () => {
 expect(th.nav.dashboard).toBe('Dashboard');expect(th.onboarding.title).toBe('Getting Started');expect(th.nav.templates).toBe('Templates')
 for (const term of ['Tree','Agent','Template','Provider','Model','Tool','Run','Execution Trace','API','Webhook']) expect(strings(th.onboarding).join(' ')).toContain(term)
 expect(th.trees.connect).toBe('Connect');expect(th.live.title).toBe('Live View');expect(th.apiKeys.title).toBe('API Keys')
})
it('keeps English and Thai configuration copy keys and interpolations in sync', () => {
 expect(Object.keys(th.uiCopy).sort()).toEqual(Object.keys(en.uiCopy).sort())
 for (const [key, value] of Object.entries(en.uiCopy)) {
  const placeholders = (s: string) => [...s.matchAll(/{{\s*([^}]+)\s*}}/g)].map(m => m[1]).sort()
  expect(placeholders(th.uiCopy[key as keyof typeof th.uiCopy])).toEqual(placeholders(value))
 }
})
it('updates formerly hardcoded Tool form language without remounting', async () => {
 render(<HttpToolConfig value={{method:'GET',url:'https://example.com',headers:'{}',query:'{}',inputSchema:'{}',outputHandling:'json',timeout:'30',testArguments:'{}'}} onChange={()=>undefined} />)
 expect(screen.getByText('Output handling')).toBeInTheDocument()
 await i18n.changeLanguage('th');expect(await screen.findByText('รูปแบบผลลัพธ์')).toBeInTheDocument();expect(screen.getByText('Headers JSON')).toBeInTheDocument()
 await i18n.changeLanguage('en');expect(await screen.findByText('Output handling')).toBeInTheDocument();expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument()
})
it('uses dedicated brand and semantic tokens rather than fixed palette classes', () => {
 render(<><Button>Save</Button><Badge variant='success'>Ready</Badge><Badge variant='destructive'>Failed</Badge><Input aria-label='Name' aria-invalid /></>)
 expect(screen.getByRole('button')).toHaveClass('hover:bg-primary-hover','active:bg-primary-active')
 expect(screen.getByText('Ready')).toHaveClass('bg-success-subtle');expect(screen.getByText('Failed')).toHaveClass('bg-danger-subtle')
 expect(screen.getByRole('textbox')).toHaveClass('aria-invalid:border-destructive')
})
it('preserves semantic button behavior after visual changes', () => {
 let calls=0;render(<Button onClick={()=>calls++}>Save</Button>);fireEvent.click(screen.getByRole('button'));expect(calls).toBe(1)
})

it('contains one copy namespace per locale and resolves every referenced copy key', () => {
 for(const locale of ['en','th']) expect(readFileSync(`src/locales/${locale}/translation.json`,'utf8').match(/"uiCopy"\s*:/g)).toHaveLength(1)
 const visit=(dir:string)=>{for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())visit(path);else if(path.endsWith('.tsx')&&!path.includes('.test.'))for(const match of readFileSync(path,'utf8').matchAll(/uiCopy\.([A-Za-z0-9]+)/g)){expect(en.uiCopy).toHaveProperty(match[1]);expect(th.uiCopy).toHaveProperty(match[1])}}}
 visit('src')
})
