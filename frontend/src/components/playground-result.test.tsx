import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PlaygroundResult } from './playground-result'
it('formats generic nested data and arrays without domain fields',()=>{render(<PlaygroundResult value={{items:[{name:'Result',count:2}],valid:true}} raw={false}/>);expect(screen.getByText('items')).toBeVisible();expect(screen.getByText('Result')).toBeVisible();expect(screen.getByText('2')).toBeVisible()})
it('formats JSON text but preserves the original value in Raw',()=>{const {rerender}=render(<PlaygroundResult value={'{"key":42}'} raw={false}/>);expect(screen.getByText('key')).toBeVisible();rerender(<PlaygroundResult value={'{"key":42}'} raw/>);expect(document.querySelector('pre')?.textContent).toContain('\\"key\\"')})
it('result content remains escaped',()=>{render(<PlaygroundResult value={'<script>alert(1)</script>'} raw={false}/>);expect(document.querySelector('script')).toBeNull();expect(screen.getByText('<script>alert(1)</script>')).toBeVisible()})

it('renders plain text headings, separate paragraphs, and lists without interpreting HTML or links', () => {
 const value = '# Findings\n\nFirst paragraph.\nContinued line.\n\n- <img src=x onerror=alert(1)>\n- [unsafe](javascript:alert(1))\n\n3. Third item\n4. Fourth item\n\n## Next steps\n\nFinal paragraph.'
 const { container, rerender } = render(<PlaygroundResult value={value} raw={false} />)
 expect(screen.getByRole('heading', { name: 'Findings' })).toBeVisible()
 expect(screen.getByRole('heading', { name: 'Next steps' })).toBeVisible()
 expect(container.querySelectorAll('p')).toHaveLength(2)
 expect(screen.getAllByRole('list')).toHaveLength(2)
 expect(container.querySelector('ol')).toHaveAttribute('start', '3')
 expect(container.querySelector('img, a')).toBeNull()
 expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
 rerender(<PlaygroundResult value={value} raw />)
 expect(container.querySelector('pre')?.textContent).toBe(JSON.stringify(value, null, 2))
})

it('keeps JSON string fields and JSON-encoded strings literal', () => {
 const { container, rerender } = render(<PlaygroundResult value={{ text: '# Literal\n- Not a list' }} raw={false} />)
 expect(container.querySelector('h3, ul')).toBeNull()
 rerender(<PlaygroundResult value={JSON.stringify('# Literal\n- Not a list')} raw={false} />)
 expect(container.querySelector('h3, ul')).toBeNull()
 expect(container.textContent).toContain('# Literal')
})

it('keeps fenced output literal', () => {
 const { container } = render(<PlaygroundResult value={'```text\n# Not a heading\n- Not a list\n```'} raw={false} />)
 expect(container.querySelector('h3, ul')).toBeNull()
 expect(container.textContent).toContain('# Not a heading')
})

it('formats emphasis and inline code while keeping unsafe markup inert and Raw exact', () => {
 const value = '**Recommendation:** use `Root` with **<script>bad()</script>**.'
 const { container, rerender } = render(<PlaygroundResult value={value} raw={false} />)
 expect(container.querySelector('strong')?.textContent).toBe('Recommendation:')
 expect(container.querySelector('code')?.textContent).toBe('Root')
 expect(container.querySelector('script')).toBeNull()
 rerender(<PlaygroundResult value={value} raw />)
 expect(container.querySelector('pre')?.textContent).toBe(JSON.stringify(value, null, 2))
})
