import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ListChecks, PanelsTopLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** Matches the existing account menu interaction, including keyboard and outside dismissal. */
export function CreateTreeMenu({ label, variant = 'default', className }: {
  label?: string; variant?: 'default' | 'outline' | 'ghost'; className?: string
}) {
  const { t } = useTranslation(), navigate = useNavigate(), id = useId()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const items = () => [...(container.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
  function dismiss() { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function choose(path: string) { setOpen(false); navigate(path) }
  return <div ref={container} className={`relative inline-flex ${className ?? ''}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      const all = items(), index = all.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
      all[next]?.focus()
    }
  }}>
    <Button variant={variant} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onFocus={event => { trigger.current = event.currentTarget }}>
      <Plus className="size-4" />{label ?? t('trees.create')}<ChevronDown className="size-3.5" />
    </Button>
    {open && <div id={id} role="menu" aria-label={t('consolidation.createMenu')} className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border-strong bg-elevated p-1 shadow-[var(--shadow-lifted)]">
      {([
        ['Visual Builder', 'visualHelp', '/trees/new/visual', PanelsTopLeft],
        ['Guided Wizard', 'wizardHelp', '/trees/new/advanced', ListChecks],
      ] as const).map(([name, help, path, Icon]) => <button key={path} type="button" role="menuitem" onClick={() => choose(path)}
        className="flex w-full items-start gap-3 rounded-sm px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" /><span><span className="block text-sm font-medium">{name}</span><span className="block text-xs text-muted-foreground">{t(`consolidation.${help}`)}</span></span>
      </button>)}
    </div>}
  </div>
}
