import { displayResult } from '@/lib/playground-execution'
import type { ReactNode } from 'react'

/** Restrained text formatting. HTML and links remain literal and React-escaped. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.startsWith('`') && part.endsWith('`') ? <code key={index} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>
        : part)
}
export function ResultText({ text }: { text: string }) {
  // Preserve fenced/code-heavy output literally rather than interpreting its contents.
  if (/^\s*```/m.test(text)) return <p className="whitespace-pre-wrap break-words">{text}</p>
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), blocks: ReactNode[] = []
  const heading = (line: string) => /^(#{1,6})\s+(.+)$/.exec(line)
  const item = (line: string) => /^\s*(?:([-*+])|([0-9]+)[.)])\s+(.+)$/.exec(line)
  let index = 0
  while (index < lines.length) {
    if (!lines[index].trim()) { index++; continue }
    const title = heading(lines[index]), firstItem = item(lines[index]), key = index
    if (title) {
      const Heading = `h${Math.min(6, title[1].length + 2)}` as 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(<Heading key={key} className="font-semibold">{inline(title[2])}</Heading>); index++
    } else if (firstItem) {
      const ordered = Boolean(firstItem[2]), items: string[] = []
      while (index < lines.length) {
        const match = item(lines[index])
        if (!match || Boolean(match[2]) !== ordered) break
        items.push(match[3]); index++
      }
      const children = items.map((value, position) => <li key={position}>{inline(value)}</li>)
      blocks.push(ordered
        ? <ol key={key} start={Number(firstItem[2])} className="list-decimal space-y-1 pl-5">{children}</ol>
        : <ul key={key} className="list-disc space-y-1 pl-5">{children}</ul>)
    } else {
      const paragraph: string[] = []
      do { paragraph.push(lines[index++]) }
      while (index < lines.length && lines[index].trim() && !heading(lines[index]) && !item(lines[index]))
      blocks.push(<p key={key} className="whitespace-pre-wrap break-words">{inline(paragraph.join('\n'))}</p>)
    }
  }
  return <div className="space-y-3 break-words">{blocks}</div>
}
/** Domain-neutral structured rendering. Text and keys are always React-escaped. */
function Formatted({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null) return <span className="text-muted-foreground">null</span>
  if (depth > 5) return <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre>
  if (Array.isArray(value)) return <ol className="list-decimal space-y-2 pl-5">{value.map((item, index) => <li key={index}><Formatted value={item} depth={depth + 1} /></li>)}</ol>
  if (typeof value === 'object') return <dl className="space-y-3">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="mb-1 text-xs font-semibold text-muted-foreground">{key}</dt><dd className="border-l border-border pl-3"><Formatted value={item} depth={depth + 1} /></dd></div>)}</dl>
  return <p className="whitespace-pre-wrap break-words">{String(value)}</p>
}
export function PlaygroundResult({ value, raw }: { value: unknown; raw: boolean }) {
  const displayed = displayResult(value)
  return <div className="mt-3 text-sm leading-6">{raw ? <pre className="whitespace-pre-wrap break-words">{JSON.stringify(value, null, 2)}</pre> : typeof displayed === 'string' && displayed === value ? <ResultText text={displayed} /> : <Formatted value={displayed} />}</div>
}
