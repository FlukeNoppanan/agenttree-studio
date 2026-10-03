export type WelcomeSnooze = "session" | "today" | "3" | "7" | "14"
export const welcomeKey = (id: string) => `agenttree-studio:welcome:v1:${id}`
const day = 86_400_000
export function welcomeSuppressed(id: string, now = Date.now()): boolean {
  try { if (sessionStorage.getItem(welcomeKey(id)) === "true") return true } catch { /* Optional UX storage. */ }
  try {
    const until: unknown = JSON.parse(localStorage.getItem(welcomeKey(id)) ?? "null")
    return typeof until === "number" && Number.isFinite(until) && until > now && until <= now + 14 * day
  } catch { return false }
}
export function snoozeWelcome(id: string, choice: WelcomeSnooze, now = Date.now()) {
  if (!["session", "today", "3", "7", "14"].includes(choice)) return
  if (choice === "session") {
    try { sessionStorage.setItem(welcomeKey(id), "true") } catch { /* Memory dismissal still works. */ }
    try { localStorage.removeItem(welcomeKey(id)) } catch { /* Optional UX storage. */ }
  } else {
    const end = new Date(now); end.setHours(24, 0, 0, 0)
    const until = choice === "today" ? end.getTime() : now + Number(choice) * day
    try { sessionStorage.removeItem(welcomeKey(id)) } catch { /* Optional UX storage. */ }
    try { localStorage.setItem(welcomeKey(id), JSON.stringify(until)) } catch { /* Memory dismissal still works. */ }
  }
}
