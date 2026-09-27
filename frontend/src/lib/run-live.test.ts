import { describe, expect, it, vi } from "vitest"
import { waitFor } from "@testing-library/react"
import { emptyLiveModel, openRunStream, reduceLive } from "@/lib/run-live"
import type { LiveEvent } from "@/lib/api"

function event(sequence: number, type = "specialist.tool.completed"): LiveEvent {
  return { sequence, type, agent_id: "worker", agent_name: "Worker", payload: { metadata: { tool_id: "inspect" } }, created_at: "2026-09-27T00:00:00Z" }
}

describe("Run live reducer", () => {
  it("sorts and deduplicates durable events while bounding text", () => {
    let state = reduceLive(emptyLiveModel, { event: event(3) })
    state = reduceLive(state, { event: event(1) })
    state = reduceLive(state, { event: event(3) })
    expect(state.events.map(item => item.sequence)).toEqual([1, 3])
    expect(state.cursor).toBe(3)
    state = reduceLive(state, { delta: { role: "specialist", agent_id: "worker", operation_id: "op", delta: "a".repeat(20000), dropped_before: 2 } })
    expect(state.text["specialist:worker:op"]).toHaveLength(16000)
    expect(state.dropped).toBe(2)
  })
})

describe("Run stream client", () => {
  it("reconnects from the durable cursor without treating lost transient text as replayable", async () => {
    const seen: number[] = []
    let cursor = 1
    const frame = (sequence: number, type: string) => `id: ${sequence}\nevent: ${type}\ndata: ${JSON.stringify({ sequence, type: type === "run.completed" ? "execution.completed" : "specialist.tool.completed", agent_id: "worker", payload: {}, created_at: "2026-09-27T00:00:00Z" })}\n\n`
    const response = (body: string) => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } }), { status: 200 })
    const mocked = vi.fn().mockResolvedValueOnce(response(frame(2, "execution.event")))
      .mockResolvedValueOnce(response(frame(2, "execution.event") + frame(3, "run.completed")))
    vi.stubGlobal("fetch", mocked)
    const stop = openRunStream("run-1", {
      cursor: () => cursor,
      onEvent: item => { if (!seen.includes(item.sequence)) seen.push(item.sequence); cursor = Math.max(cursor, item.sequence) },
      onDelta: () => { throw new Error("Transient output should not be replayed") },
      onConnection: () => {}, onAuthorizationLost: () => {},
    })
    await waitFor(() => expect(seen).toEqual([2, 3]), { timeout: 3000 })
    expect(mocked.mock.calls[0][0]).toContain("after=1")
    expect(mocked.mock.calls[1][0]).toContain("after=2")
    stop()
    vi.unstubAllGlobals()
  })
  it("receives live output before terminal completion through cookie fetch", async () => {
    const frames = [
      'event: agent.output.delta\ndata: {"role":"specialist","agent_id":"worker","operation_id":"op","delta":"live","dropped_before":0}\n\n',
      'id: 2\nevent: run.completed\ndata: {"sequence":2,"type":"execution.completed","agent_id":null,"payload":{},"created_at":"2026-09-27T00:00:00Z"}\n\n',
    ]
    const mocked = vi.fn().mockImplementation(async () => new Response(new ReadableStream({ start(controller) {
      for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame))
      controller.close()
    } }), { status: 200, headers: { "Content-Type": "text/event-stream" } }))
    vi.stubGlobal("fetch", mocked)
    const order: string[] = []
    const stop = openRunStream("run-1", {
      cursor: () => 1, onEvent: item => order.push(item.type), onDelta: item => order.push(item.delta),
      onConnection: state => order.push(state), onAuthorizationLost: () => order.push("lost"),
    })
    await waitFor(() => expect(order).toContain("ended"))
    expect(order.indexOf("live")).toBeLessThan(order.indexOf("execution.completed"))
    expect(mocked.mock.calls[0][0]).toContain("after=1")
    expect(mocked.mock.calls[0][1].credentials).toBe("same-origin")
    expect(JSON.stringify(mocked.mock.calls[0])).not.toContain("Authorization")
    stop()
    vi.unstubAllGlobals()
  })
})
