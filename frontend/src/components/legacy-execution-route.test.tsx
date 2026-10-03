import { render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, it } from 'vitest'
import { LegacyExecutionRoute } from './legacy-execution-route'

it.each([
  ['/runs', '/executions'],
  ['/execution-trace', '/executions'],
  ['/runs/real-run?trace=1#events', '/executions/real-run?trace=1#events'],
])('preserves the legacy link %s', async (path, expected) => {
  const router = createMemoryRouter([
    { path: '/runs', element: <LegacyExecutionRoute /> },
    { path: '/runs/:runId', element: <LegacyExecutionRoute /> },
    { path: '/execution-trace', element: <LegacyExecutionRoute /> },
    { path: '/executions', element: <p>Executions</p> },
    { path: '/executions/:runId', element: <p>Execution detail</p> },
  ], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe(expected))
})
