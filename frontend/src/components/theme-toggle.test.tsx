import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach,expect,it } from 'vitest'
import { ThemeToggle, applyInitialTheme } from '@/components/theme-toggle'
import i18n from '@/i18n'
beforeEach(async()=>{localStorage.clear();document.documentElement.classList.remove('dark');await i18n.changeLanguage('en')})
it('switches existing theme class and persists the selected theme',()=>{
 localStorage.setItem('agenttree-theme','light');render(<ThemeToggle/>);fireEvent.click(screen.getByRole('button',{name:'Switch to dark theme'}))
 expect(document.documentElement).toHaveClass('dark');expect(localStorage.getItem('agenttree-theme')).toBe('dark')
 fireEvent.click(screen.getByRole('button',{name:'Switch to light theme'}));expect(document.documentElement).not.toHaveClass('dark')
})
it('keeps distinct shared background, card, elevated and input surfaces',()=>{
 const css=readFileSync('src/index.css','utf8')
 for(const block of [css.split('.dark {')[0],css.split('.dark {')[1].split('@theme')[0]]){
 const token=(name:string)=>block.match(new RegExp(`--${name}: (#[A-Fa-f0-9]+)`))?.[1]
 expect(new Set(['background','card','elevated','input'].map(token)).size).toBe(4)
 expect(token('background')).not.toMatch(/#(?:000000|FFFFFF)/i)
 }
})
it('keeps normal and muted text readable across shared surfaces',()=>{
 const css=readFileSync('src/index.css','utf8')
 const luminance=(hex:string)=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
 for(const block of [css.split('.dark {')[0],css.split('.dark {')[1].split('@theme')[0]]){
 const token=(name:string)=>block.match(new RegExp(`--${name}: (#[A-Fa-f0-9]+)`))![1]
 for(const text of ['foreground','muted-foreground'])for(const surface of ['background','card','elevated','input']){
 const a=luminance(token(text)),b=luminance(token(surface));expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5)
 }
 }
})

it('applies the saved Dark preference before authenticated shell mounting',()=>{
 localStorage.setItem('agenttree-theme','dark');applyInitialTheme();expect(document.documentElement).toHaveClass('dark')
 localStorage.setItem('agenttree-theme','light');applyInitialTheme();expect(document.documentElement).not.toHaveClass('dark')
})
