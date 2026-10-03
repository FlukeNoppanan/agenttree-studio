import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, it } from 'vitest'
import i18n from '@/i18n'
import { CreateTreeMenu } from './create-tree-menu'

beforeEach(async () => { await i18n.changeLanguage('en') })
function mount() {
  const router = createMemoryRouter([
    { path: '/', element: <><CreateTreeMenu /><button>Outside</button></> },
    { path: '/trees/new/visual', element: <p>Builder directly</p> },
    { path: '/trees/new/advanced', element: <p>Wizard directly</p> },
  ])
  render(<RouterProvider router={router} />)
  return router
}
it('opens a keyboard menu and Escape restores trigger focus without navigation', async () => {
  const router = mount(), trigger = screen.getByRole('button', { name: /Create Tree/ })
  trigger.focus(); fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  await waitFor(() => expect(screen.getByRole('menuitem', { name: /Visual Builder/ })).toHaveFocus())
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: /Guided Wizard/ })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(trigger).toHaveFocus(); expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
})
it.each([['Visual Builder', '/trees/new/visual'], ['Guided Wizard', '/trees/new/advanced']])('routes %s directly without an intermediate selector', (label, path) => {
  const router = mount(); fireEvent.click(screen.getByRole('button', { name: /Create Tree/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(label) }))
  expect(router.state.location.pathname).toBe(path)
})
it('dismisses on outside pointer and keeps Thai technical labels', async () => {
  await i18n.changeLanguage('th'); mount()
  fireEvent.click(screen.getByRole('button', { name: /Tree/ }))
  expect(screen.getByRole('menuitem', { name: /Visual Builder/ })).toHaveTextContent('Canvas')
  expect(screen.getByRole('menuitem', { name: /Guided Wizard/ })).toBeVisible()
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
