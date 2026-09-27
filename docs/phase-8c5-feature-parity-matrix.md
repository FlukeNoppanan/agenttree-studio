# Phase 8C.5 Core ↔ Studio parity matrix

Statuses are `SUPPORTED`, `PARTIAL`, `MISSING`, and `NOT APPLICABLE`. Columns: **Core / Studio backend / persistence / API / config UI / Live View / automated test / browser test**. `NOT APPLICABLE` in a UI column means the capability is an internal contract or is intentionally configured at another layer. `PARTIAL` and `MISSING` entries have a concrete action or deferral in the final column. Browser status records authenticated checks against an isolated temporary Studio database plus served-source checks from rebuilt Docker images. Persistent Docker login was unavailable; automatic approval review rejected creating a privileged test account in that database. Core internals are tested through Studio behavior, not visually inspected.

| Capability | Core | Backend | Persistence | API | Config UI | Live View | Test | Browser | Action required / reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Root planning | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | SUPPORTED | SUPPORTED | PARTIAL | Planning strategy is Core-owned; expose instructions/revision controls, not hidden planning JSON. |
| Root direct response | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | PARTIAL | Selected by Core routing. |
| Root final review | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Review switch and revision limit in Root editor. |
| Root final synthesis | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | Always enabled; persisted final output is authoritative. |
| Manager decomposition | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Manager instructions/capabilities and Tree limits. |
| Manager review/revisions | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Bounded Root advanced setting. |
| Specialist execution | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | None. |
| Per-agent provider and exact model | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Root, Manager, Specialist editors share exact-ID selector. |
| Provider discovery/qualification | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | Studio additionally qualifies text generation. |
| Provider capability flags | SUPPORTED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NOT APPLICABLE | SUPPORTED | PARTIAL | Studio shows qualified models; detailed Core capability flags remain internal because model readiness is the selection contract. |
| OpenAI | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Connection and model access need user credentials. |
| Gemini | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Same. |
| Ollama | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Local host reachability is deployment-specific. |
| Groq | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Same. |
| OpenRouter | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Slash-containing model IDs stay exact. |
| Cerebras | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Same. |
| Custom OpenAI-compatible | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Explicit base URL and Secret. |
| Root Tools | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Explicit binding only. |
| Manager Tools | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Explicit binding only. |
| Specialist Tools | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Explicit binding only. |
| Function/HTTP Tools | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Studio HTTP tool maps to Core function Tool. Arbitrary Python callables are intentionally host code, not an editable UI. |
| MCP stdio/HTTP Tools | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Selected discovered Tools only. |
| Artifact creation Tool | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Explicit Tool connection and Agent assignment. |
| Tool authorization/limits | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Shared Core ToolSession is authoritative. Low-level byte limits stay runtime-only. |
| Directional Manager peers | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Wizard source→target checkboxes; no implied reverse edge. |
| Collaboration message budgets | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | Root advanced per-manager/total limits; low-level payload/turn limits stay runtime-only. |
| Specialist peer isolation | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | NOT APPLICABLE | No Specialist peer feature exists. |
| Background execution/states | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | Queued through cancelled are distinct. |
| Cancellation/deadline | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | PARTIAL | SUPPORTED | SUPPORTED | SUPPORTED | V2 timeout is API/per submission; UI default timeout only, advanced input can be added later without changing Core. |
| Usage/metrics | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | PARTIAL | Numeric details panel avoids credential-bearing raw payloads. |
| Durable events/sequence | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | Studio DB sequence survives refresh. |
| Operation journal | SUPPORTED | MISSING | MISSING | MISSING | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | Deferred: Studio uses InMemoryExecutionStore; requires durable Core store integration and replay ownership. No fake recovery UI. |
| Checkpoints/recovery | SUPPORTED | MISSING | MISSING | MISSING | NOT APPLICABLE | PARTIAL | SUPPORTED | PARTIAL | Deferred architectural integration; Studio shows `RECOVERY_UNAVAILABLE` after restart. |
| Recovery-blocked states | SUPPORTED | PARTIAL | PARTIAL | PARTIAL | NOT APPLICABLE | PARTIAL | SUPPORTED | PARTIAL | Core granular blocked codes require durable Core store; Studio exposes its own restart failure. |
| AgentOutputDelta attribution | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Transient, never replayed as durable text. |
| Artifacts/types/intents | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | Preview never applies file intents. |
| Artifact revisions/supersession | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | PARTIAL | Supersedes ID is exposed from metadata; all versions retained. |
| Final artifact selection | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | `is_final` follows FinalResult selection. |
| Partial result | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | Completed Run, distinct final `partial`. |
| Normalized provider errors | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | PARTIAL | Safe category and message, no provider response body. |
| FinalResult semantics | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | Final output, status, artifacts, trace, usage stay separate. |

## Deferred architecture

A PostgreSQL implementation of Core `ExecutionStore` plus reconstruction of provider clients, Tool bindings, and Manager permissions is needed before Core checkpoints, operation journal replay, and granular recovery-blocked codes can be surfaced. Implementing a UI toggle without that store would falsely promise recovery. Low-level safety byte/payload limits and arbitrary Python Function Tool code remain host/runtime concerns; Studio exposes explicit HTTP, MCP, and artifact Tools instead.
