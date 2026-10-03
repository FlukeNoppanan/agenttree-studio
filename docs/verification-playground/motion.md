# Motion verification

Real Chrome observations are retained in final-acceptance.json and reconnect-acceptance.json. These are observations of actual Core operations, not a simulated sequence.

| Interaction | Evidence and limit |
| --- | --- |
| Root idle → running | Real durable operation.in_flight changed the Root UUID's data-execution-state and localized phase. See 06-root-running and recorded node observations. |
| Root running → completed | Real operation commits and terminal reconciliation settled the Root; untouched Manager/Specialist nodes remained Idle. |
| Failure | Disposable unreachable Provider and real Gemini triage failures settled observed Root activity to Failed; no unrelated Specialist was marked failed/running. |
| Cancellation | Real HTTP 200 acknowledgement carried cancellation_requested; eventual persisted status was cancelled. The short transition is established by response capture, not a misleading screenshot title. |
| Timeline updates | Actual durable execution/operation events appeared incrementally, then remained inspectable after reload. |
| Result appearance | Persisted result uses the shared 180ms insertion motion. No synthetic typing or character reveal. |
| Edge emphasis | Code uses one-time 500ms shared Builder pulse only for real manager.decompose or specialist.generate/revision starts. Initial replay/history does not pulse. **No successful delegated Gemini execution was observed; real edge-motion acceptance is outstanding.** |
| Multiple active Agents/review/revision | Reducer behavior is tested against operation contracts; concurrent/revision browser motion remains unobserved. |
| Reduced motion | Chrome Emulation requested prefers-reduced-motion: reduce; computed animation duration was effectively zero (0.00001s). Shared Builder overrides disable animation and transitions; fit viewport duration becomes zero. State text remains visible. |
| Idle cost | 25-Agent historical/idle graph had zero observed DOM mutations during a 1.2s observation interval. This is a smoke check, not an FPS/CPU benchmark. |

No continuous idle edge animation, fake SSE, artificial progress, camera oscillation, execution editing, or execution configuration mutation is introduced. Viewport pan/zoom/Fit remain available; automatic camera following is deliberately omitted.
