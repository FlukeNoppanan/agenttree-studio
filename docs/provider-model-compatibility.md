# Provider and Model compatibility

A connected Provider means the configured AI service is reachable. A discovered Model is a catalog entry. Neither proves that the Model can make AgentTree decisions.

Explicit verification first checks generation, then six small synthetic checks: Structured Output, Root planning, capability triage, Manager decomposition, Manager Review and Root Final Review. The decision checks invoke the actual Core strategies and validators, including the existing single repair allowance. Planning/routing probes must demonstrate delegation and registered capabilities; a syntactically valid empty response does not demonstrate those responsibilities.

- **AgentTree Ready:** all six checks passed alongside generation. This is bounded compatibility evidence, not a guarantee of task quality or reliability on every input.
- **Limited:** generation works, but one or more decision checks failed or have not been checked under this policy. Old OK-only qualification is displayed as Limited until rechecked.
- **Unavailable:** generation or availability failed. Temporary transport, authentication, timeout and rate-limit interruptions are reported separately and can be retried.

The Provider model list contains safe check results, last-check time and a per-Model retry action. Unusable/unverified catalog entries are collapsed under Other Models. Page navigation does not trigger generation. Verification makes multiple actual Provider requests, with at most one repair per decision; use the individual action when checking a large catalog.

Root guidance covers planning, triage and final review; Manager guidance covers decomposition and review. Specialist generation is checked, but Tool/MCP calling and arbitrary task quality are **not** certified by these probes. A Model can pass a role's checks while remaining Limited overall. The selected binding is retained and the relevant distinction is shown in the editor. Limited generation-capable Models remain available for deliberate expert testing, using the same backend readiness/runtime path.

Qualification evidence is versioned inside the existing ProviderModel metadata. No database migration or new execution endpoint is needed. Rediscovery invalidates prior verification under the existing lifecycle. Older Runs keep their original pinned configuration and events.

## Local Ollama

The Ollama adapter maps the existing neutral response_format to Ollama's native JSON/schema `format` for control decisions and disables separate thinking for those requests. SDK response envelopes are unpacked at the adapter boundary. Only the answer channel is parsed as a decision. Generic text generation retains its existing behavior.

AgentTree never changes the selected Model/Provider automatically and never silently sends a local Ollama task to a cloud Provider. No fallback was added.

## Decision normalization and repair

Canonical JSON and one complete JSON Markdown fence are supported, including a single fenced payload surrounded by prose that contains no competing JSON containers. Duplicate keys, multiple payloads, invalid numeric constants, ambiguous prose, arbitrary wrapper objects, unsupported enum values and unknown capabilities remain invalid. No target, capability, delegation or review decision is synthesized by normalization.

Validators retain ownership of semantics. A failed decision emits an allowlisted reason code and, for known fields, the field name. The repair prompt receives these safe diagnostics with the original contract and registered choices. Raw rejected model text is not logged or sent to ordinary UI. The repair budget remains one.

New durable decision events share a decision_id within one invocation, so a repaired triage decision cannot conceal a later failed final-review decision. Human Trace names each stage and repair outcome; Technical Trace keeps every original row and the safe diagnostics. Historical rows without reason codes are not retrospectively filled with invented information.

Execution bindings are shown from the pinned Tree version once per Agent and clearly labelled configuration evidence. Recorded Specialist generation identities are separately deduplicated across subtasks. Missing historical identity remains unknown.
