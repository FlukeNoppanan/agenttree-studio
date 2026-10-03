interface Preferences { collapsed: boolean; understood: boolean; connectedTreeIds: string[] }
const defaults = (): Preferences => ({ collapsed: false, understood: false, connectedTreeIds: [] })
const key = (userId: string) => `agenttree-studio:onboarding:v1:${userId}`

export function onboardingPreferences(userId: string): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? "null")
    if (!value || typeof value !== "object") return defaults()
    const saved = value as Partial<Preferences>
    return { collapsed: saved.collapsed === true, understood: saved.understood === true, connectedTreeIds: Array.isArray(saved.connectedTreeIds)
      ? saved.connectedTreeIds.filter((id): id is string => typeof id === "string").slice(-20) : [] }
  } catch { return defaults() }
}

export function saveOnboardingPreferences(userId: string, update: Partial<Preferences>) {
  try { localStorage.setItem(key(userId), JSON.stringify({ ...onboardingPreferences(userId), ...update })) }
  catch { /* Storage restrictions must not prevent using Studio. */ }
}

export function acknowledgeConnect(userId: string, treeId: string) {
  const ids = onboardingPreferences(userId).connectedTreeIds
  saveOnboardingPreferences(userId, { connectedTreeIds: [...new Set([...ids, treeId])].slice(-20) })
}
