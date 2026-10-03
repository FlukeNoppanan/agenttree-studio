import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { api, type TreeDetail } from '@/lib/api'
import { TreeWizard } from './tree-wizard'

vi.mock('@/components/test-run-dialog', () => ({ TestRunDialog: () => null }))

beforeEach(async () => {
 await i18n.changeLanguage('en')
 vi.spyOn(api, 'listProviders').mockResolvedValue([])
 vi.spyOn(api, 'listTools').mockResolvedValue([])
 vi.spyOn(api, 'createTree').mockResolvedValue({ id: 'draft', status: 'draft' } as TreeDetail)
 vi.spyOn(api, 'validateTree').mockResolvedValue({ valid: true, errors: [], validated_at: '' })
})
afterEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage('en') })

it.each(['en', 'th'])('keeps draft validation separate from the translated Ready action in %s', async language => {
 await i18n.changeLanguage(language)
 render(<MemoryRouter><TreeWizard /></MemoryRouter>)
 await waitFor(() => expect(api.listProviders).toHaveBeenCalled())
 fireEvent.change(screen.getByPlaceholderText('Network Operations Tree'), { target: { value: 'Presentation draft' } })
 const steps = i18n.t('wizard.steps', { returnObjects: true }) as string[]
 fireEvent.click(screen.getByRole('button', { name: steps[5] }))
 expect(screen.getByRole('button', { name: i18n.t('integrationPolish.markReady') })).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name: i18n.t('uiCopy.validateDraft') }))
 const message = i18n.t('integrationPolish.configurationValid')
 await waitFor(() => expect(within(screen.getByRole('status')).getByText(message)).toBeVisible())
 expect(api.validateTree).toHaveBeenCalledWith('draft', false)
 expect(screen.queryByText(i18n.t('playground.ready'))).toBeNull()
 expect(screen.queryByText('Ready for use')).toBeNull()
})
