import { Navigate, useLocation, useParams } from 'react-router-dom'

/** Keep historical Run/Trace links on the single execution detail surface. */
export function LegacyExecutionRoute() {
  const { runId } = useParams(), { search, hash } = useLocation()
  return <Navigate replace to={`/executions${runId ? `/${runId}` : ''}${search}${hash}`} />
}
