import type { LiveEvent } from "@/lib/api"

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "ended"
export interface AgentDelta {
  role: string; agent_id: string; operation_id: string; delta: string; dropped_before: number
}
export interface LiveModel {
  events: LiveEvent[]; cursor: number; text: Record<string, string>; dropped: number
}
export const emptyLiveModel: LiveModel = { events: [], cursor: 0, text: {}, dropped: 0 }
const MAX_EVENTS = 1000
const MAX_TEXT_PER_OPERATION = 16000

export function reduceLive(model: LiveModel, action: { event?: LiveEvent; delta?: AgentDelta }): LiveModel {
  if (action.event) {
    const event = action.event
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || model.events.some(item => item.sequence === event.sequence)) return model
    const events = [...model.events, event].sort((a, b) => a.sequence - b.sequence).slice(-MAX_EVENTS)
    return { ...model, events, cursor: Math.max(model.cursor, event.sequence) }
  }
  if (action.delta) {
    const item = action.delta
    const key = `${item.role}:${item.agent_id}:${item.operation_id}`
    const prior = model.text[key] ?? ""
    const text = { ...model.text, [key]: (prior + item.delta).slice(-MAX_TEXT_PER_OPERATION) }
    const keys = Object.keys(text)
    for (const old of keys.slice(0, Math.max(0, keys.length - 100))) delete text[old]
    return { ...model, text,
      dropped: model.dropped + Math.max(0, item.dropped_before || 0) }
  }
  return model
}

export function openRunStream(runId: string, options: {
  cursor: () => number
  onEvent: (event: LiveEvent) => void
  onDelta: (delta: AgentDelta) => void
  onConnection: (state: ConnectionState) => void
  onAuthorizationLost: () => void
}): () => void {
  const controller = new AbortController()
  const path = `/api/studio/runs/${encodeURIComponent(runId)}/stream`
  let stopped = false
  const pause = (ms: number) => new Promise<void>(resolve => {
    const finish = () => { window.clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve() }
    const timer = window.setTimeout(finish, ms)
    controller.signal.addEventListener("abort", finish, { once: true })
  })
  const loop = async () => {
    let attempts = 0
    options.onConnection("connecting")
    while (!stopped) {
      try {
        const response = await fetch(`${path}?after=${options.cursor()}`, {
          credentials: "same-origin", headers: { Accept: "text/event-stream" }, signal: controller.signal,
        })
        if ([401, 403, 404].includes(response.status)) { options.onAuthorizationLost(); return }
        if (!response.ok || !response.body) throw new Error(`Stream unavailable (${response.status})`)
        attempts = 0
        options.onConnection("connected")
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (!stopped) {
          const { done, value } = await reader.read()
          if (done) break
          buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll("\r\n", "\n")
          if (buffer.length > 1_000_000) throw new Error("SSE frame exceeded limit")
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const fields = frame.split("\n")
            const type = fields.find(line => line.startsWith("event:"))?.slice(6).trim()
            const id = fields.find(line => line.startsWith("id:"))?.slice(3).trim()
            const data = fields.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")
            if (type && data) {
              try {
                const payload = JSON.parse(data) as Record<string, unknown>
                if (type === "agent.output.delta") {
                  if (typeof payload.agent_id === "string" && typeof payload.delta === "string") options.onDelta({
                    role: String(payload.role ?? "specialist"), agent_id: payload.agent_id,
                    operation_id: String(payload.operation_id ?? ""), delta: payload.delta,
                    dropped_before: Number(payload.dropped_before ?? 0),
                  })
                } else if (id && /^\d+$/.test(id)) {
                  options.onEvent({ sequence: Number(id), type: String(payload.type ?? type),
                    agent_id: typeof payload.agent_id === "string" ? payload.agent_id : null,
                    agent_name: typeof payload.agent_name === "string" ? payload.agent_name : null,
                    payload: (payload.payload && typeof payload.payload === "object" ? payload.payload : {}) as Record<string, unknown>,
                    created_at: String(payload.created_at ?? ""),
                  })
                }
                if (["run.completed", "run.failed", "run.cancelled"].includes(type)) {
                  options.onConnection("ended")
                  return
                }
              } catch { /* Malformed frames do not become UI events. */ }
            }
            boundary = buffer.indexOf("\n\n")
          }
        }
      } catch {
        if (stopped) break
      }
      if (stopped) break
      attempts += 1
      options.onConnection("reconnecting")
      await pause(Math.min(10000, 500 * 2 ** Math.min(attempts, 5)))
    }
  }
  void loop()
  return () => { stopped = true; controller.abort(); options.onConnection("disconnected") }
}
