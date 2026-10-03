import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { AgentDraft, ProviderModel } from '@/lib/api'
import { AgentDetails } from './agent-details'

beforeEach(async () => { await i18n.changeLanguage('en') })

it.each(['root', 'manager', 'specialist'] as const)('uses the %s role token for labels and icons', role => {
 const agent: AgentDraft = { id: role, agent_type: role, name: 'Example', description: '', parent_agent_id: null, system_instruction: null, settings: {}, capabilities: [], provider_connection_id: null, model_id: null }
 const { container } = render(<AgentDetails agent={agent} agents={[agent]} providers={[]} models={[]} tools={[]} assignedToolIds={[]} childrenCount={0} />)
 expect(screen.getByText(i18n.t(`agents.${role}`))).toHaveClass(`text-${role}-agent`)
 expect(container.querySelector(`.bg-${role}-agent\\/15`)).toHaveClass(`text-${role}-agent`)
})

it('preserves unavailable qualification warnings and the configured model identity', () => {
 const agent: AgentDraft = { id: 'agent', agent_type: 'specialist', name: 'Example', description: '', parent_agent_id: null, system_instruction: null, settings: {}, capabilities: [], provider_connection_id: 'provider', model_id: 'configured-model' }
 const model = { provider_connection_id: 'provider', model_id: 'configured-model', is_available: true, generation_candidate: false, qualification_status: 'qualified' } as ProviderModel
 render(<AgentDetails agent={agent} agents={[agent]} providers={[]} models={[model]} tools={[]} assignedToolIds={[]} childrenCount={0} />)
 expect(screen.getByText(i18n.t('trees.modelUnavailable'))).toBeVisible()
 expect(screen.getByText('configured-model')).toBeVisible()
 expect(agent.model_id).toBe('configured-model')
})
