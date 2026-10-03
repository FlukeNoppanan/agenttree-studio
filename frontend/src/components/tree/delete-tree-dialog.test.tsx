import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { DeleteTreeDialog } from './delete-tree-dialog'

beforeEach(async () => { await i18n.changeLanguage('en') })

it('explains actual cascading deletion, retains shared resources, and focuses Cancel', async () => {
 const confirm = vi.fn().mockResolvedValue(undefined)
 render(<DeleteTreeDialog name="Verification Tree" open onOpenChange={vi.fn()} onConfirm={confirm} />)
 expect(screen.getByText(/associated Runs and Trace/)).toHaveTextContent('Providers, Tools, and Secrets are retained')
 await waitFor(() => expect(screen.getByRole('button', {name:'Cancel'})).toHaveFocus())
 expect(confirm).not.toHaveBeenCalled()
})

it('Thai keeps technical terms and explains irreversible deletion naturally', async () => {
 await i18n.changeLanguage('th')
 render(<DeleteTreeDialog name="Disposable" open onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
 expect(screen.getByRole('heading')).toHaveTextContent('ลบ Tree นี้หรือไม่?')
 expect(screen.getByText(/Execution Trace/)).toHaveTextContent('กู้คืนไม่ได้')
 expect(screen.getByRole('button', { name:'ยกเลิก' })).toBeVisible()
})

it('shows safe deletion failures inside the confirmation', () => {
 render(<DeleteTreeDialog name="Disposable" open onOpenChange={vi.fn()} onConfirm={vi.fn()} error="Tree access denied" />)
 expect(screen.getByRole('alert')).toHaveTextContent('Tree access denied')
})

it('waits for confirmation completion without allowing duplicate submissions', async () => {
 let finish!: () => void
 const confirm = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
 render(<DeleteTreeDialog name="Disposable" open onOpenChange={vi.fn()} onConfirm={confirm} />)
 fireEvent.click(screen.getByRole('button', {name:'Delete'}))
 expect(screen.getByRole('button', {name:'Delete'})).toBeDisabled()
 expect(confirm).toHaveBeenCalledOnce()
 finish()
 await waitFor(() => expect(screen.getByRole('button', {name:'Delete'})).toBeEnabled())
})
