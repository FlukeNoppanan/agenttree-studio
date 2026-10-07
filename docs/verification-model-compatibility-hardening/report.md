# Model compatibility and Provider interoperability hardening

## Status

**COMPLETE — required curated qualification, four Provider Fast Runs, one successful Deep hierarchy, browser acceptance and engineering checks verified on 7 October 2026.**

This is a bounded compatibility improvement, not a guarantee of arbitrary task quality or universal model support. Expected rate-limit and Partial outcomes are retained in the evidence summary below.

## Initial state and audit

- Studio HEAD `6fd567422194fee4481a7bfbd8d94dd43e373e49`; Core HEAD `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`. Both already had substantial uncommitted qualification/protocol/UI work. Initial tracked patches saved to `/tmp/compatibility-studio-initial.diff` and `/tmp/compatibility-core-initial.diff`. No reset, stash, clean, checkout, commit or publication.
- Existing runtime qualification, provider-neutral decisions, protocol execution-mode and previous audit reports were read. Current source and database supersede older counts and network blockers.
- Actual Docker Desktop `desktop-linux` runtime is accessible through approved host execution. Backend, frontend and PostgreSQL were healthy before changes. Database migration `0014_resource_history`.
- Existing database: 4 Providers, 79 catalog Models, 3 Secrets, 6 Trees, 24 Runs, 1009 Trace events, 4 Tools, 3 users. Credential-free baseline IDs and one-way row fingerprints are in `checks/initial-inventory.json`. No credentials or raw reasoning were exported.
- All four Providers are connected in database. Prior IPv6-only Docker DNS connectivity failure was corrected by the user before this task; no network changes are part of this phase.
- Failed evidence Run `ecb0407a-a3b4-4999-af7c-6845241cb8fb` and its Tree remain retained. Its original provider exception cannot be reconstructed from persisted coarse failure events; no speculative cause is asserted.

## Before-state metrics

Baseline model statuses and role/check evidence are in `checks/initial-inventory.json`. Groq qwen and two Gemini Flash Lite entries were Ready. Gemini 3 Flash Preview and Groq allam were Limited. Both installed Ollama models were Ready. Cerebras qwen was Pending/unknown; gpt-oss was Pending/provider-rate-limited. An account-discovered mainstream Llama general model was not present; prompt-guard entries are not counted as general models.

## Architecture and canonical contracts

The existing path remains Provider adapter → ProviderResponse → `core/structured_output.py` → real strategy validators → existing orchestration. No parallel parser, alternate engine, model-name whitelist or Provider/model fallback.

- Root: boolean delegation and nonempty direct output when direct.
- Triage: objective and registered Manager capabilities.
- Decomposition: subtask objectives and Manager-owned Specialist capabilities.
- Manager/final review: exact pass/revise/fail plus feedback.
- Tool calls remain executable ToolSession data, not repurposed as decisions.

## Implemented changes

1. Extend the existing normalizer to one unambiguous JSON object surrounded by prose, explicit content-parts wrappers and exclusive function-argument carriers. Duplicate keys, multiple competing objects, missing fields, unknown references and invalid enums remain errors. No semantic aliases or invented decisions.
2. Shared answer-part extraction for compatible adapters; explicit Gemini answer parts exclude thought parts. Raw diagnostic redaction drops reasoning parts. Hidden reasoning is never a canonical payload.
3. Compatible HTTP request negotiation retries once only for a structured API error identifying unsupported `temperature` or `response_format`; model, Provider and prompt remain fixed. Unknown 400/422 errors do not trigger fallback.
4. A 64-token generation probe may retry once at 2048 only after actual final-content absence with `finish_reason=length`. No blanket retry of empty responses. Existing 2048-token decision bound and one semantic repair remain.
5. Safe diagnostics reuse existing decision events via scoped collection. Persist request mode, response/final presence, reasoning-presence boolean, representation, validation and bounded repair outcome; never output text, prompts, credentials or reasoning.
6. Delegation qualification now uses the actual Deep contract. A correct Fast direct answer no longer biases a probe intended to demonstrate delegation. Fast/Deep runtime semantics are unchanged.
7. Resume retains passed probes from an interrupted attempt; explicit fresh rechecks still evaluate fresh contracts. Existing atomic claim, retry cooldown and provider/model failure scopes remain.
8. Readiness and runtime share role-check evidence gating. Limited Specialist generation remains usable; Root/Manager require their actual passed checks. Old generation-only qualification proves Specialist output only. No saved binding is replaced.
9. Discovery retains reliable chat/modality metadata and excludes only metadata-proven non-text/non-chat candidates. Unknown metadata remains testable; names alone are not exclusion evidence.
10. Existing compatibility details show concise safe diagnostics and required field names. Builder warns about incompatible role bindings; readiness provides the authoritative block. EN/TH copy preserves technical terms; no UI redesign.

## Qualification semantics and canonical contract inventory

| Contract | Required semantic evidence | Normalization and rejection |
|---|---|---|
| Root planning/direct | `delegate` boolean; nonempty `direct_output` for direct response | Deep still requires delegation; no invented Manager or direct answer |
| Root triage/capability routing | Nonempty `objective`; list `required_capabilities` from the registered Manager capability scope | Existing case/whitespace capability canonicalization; unknown capabilities rejected |
| Manager decomposition | `subtasks` list with objective and Manager-owned Specialist capabilities per subtask | Unknown references rejected; no automatic reassignment of missing work |
| Manager Review | Exact `pass` / `revise` / `fail` plus feedback | No semantic mapping of arbitrary approval prose; one bounded repair then revalidation |
| Root Final Review | Same review contract against actual Manager outcomes | No bypass or forced pass; Partial outcomes remain Partial |
| Specialist result | Real final answer from the configured Provider/Model | Generation capability only; no claim that all Tool calls/task quality are qualified |
| Tool requests | Existing ToolSession IDs, names, arguments and ownership | Native executable Tool calls remain outside decision-wrapper extraction |

`Ready` means the synthetic standard profile passed. `Limited` remains useful for demonstrated roles. `Pending` includes incomplete/unknown/transient/verifying attempts, not a demonstrated incompatibility. `Unavailable` retains model-level unusable evidence. The runtime and readiness use the same role checks; Provider ↔ Tool support is evaluated separately.

Failure details distinguish transport/quota, representation, missing/schema fields and semantic capability outcomes. They keep existing public status names. Repair is one additional decision request, followed by canonical validation; it cannot fabricate a missing routing reference or certify a wrong capability. Generation retry is separately bounded and requires observed token exhaustion. Optional request fallback has at most one retry and only the specifically rejected allowlisted feature is removed.

## Supported representations and request capability scope

Supported at the existing boundary: native objects, JSON text, encoded JSON, complete JSON fences, one unambiguous object surrounded by prose, exclusive presentation wrappers, nested explicit answer text/content/parts carriers, and exclusive function argument object/JSON carriers. Explicit reasoning parts are excluded before final-content extraction. Multiple competing objects, duplicate keys, invalid enums/numbers, excessive depth/size, mixed structured answer arrays and missing canonical semantics remain rejected.

No model-specific budgets, parsing branches or automatic Provider/model switches were added. Optional negotiation currently covers structured API rejection of `response_format` or `temperature` on the compatible synchronous request path. Other feature families keep their adapter contracts; this phase does not promise universal negotiation of tools, streaming, reasoning options or vendor-specific schema support.

## Curated real Provider matrix

All models were already discovered in the account. Fresh successful/evaluated proof was retained; stale/incomplete entries were checked through the actual ModelDiscoveryService and configured adapters. No new credentials were used.

| Provider | Model | Before | After | Evidence |
|---|---|---|---|---|
| Groq | qwen/qwen3.8-27b | Ready | Ready | Stale proof rechecked; actual Fast completed |
| Groq | allam-2-7b | Limited | Limited | Root capability routing still malformed after bounded repair; Specialist and Manager profile useful |
| Groq | openai/gpt-oss-120b | Unavailable | Ready | Actual generation and canonical decision checks passed; reasoning/final separation handled |
| Gemini | models/gemini-3.1-flash-lite | Ready | Ready | Fresh proof retained; actual Fast completed |
| Gemini | models/gemini-3.1-flash-lite-preview | Ready | Ready | Fresh proof retained |
| Gemini | models/gemini-3-flash-preview | Limited | Limited | Fresh evaluated proof retained; delegation/routing not demonstrated |
| Gemini | models/gemini-flash-lite-latest | Pending | Ready | Actual check completed |
| Cerebras | qwen-3.8-27b | Pending | Ready | Actual qualification; Fast and full Deep completed |
| Cerebras | gpt-oss-120b | Pending (rate limit) | Ready | Resumed actual qualification, existing passed checks retained |
| Ollama | phi4-mini:latest | Ready | Ready | Stale proof rechecked; actual Fast completed |
| Ollama | qwen3:4b | Ready | Ready | Fresh proof retained |

A mainstream general-purpose Llama model was absent from this account catalog. Prompt-guard models were not substituted or forced Ready. Gemini's remaining 33 Pending models were not bulk hammered; existing incomplete proof remains visible.

Curated set: **5 Ready / 2 Limited / 1 Unavailable / 3 Pending → 9 Ready / 2 Limited / 0 Unavailable / 0 Pending**. This improvement is not attributed solely to formatting: it includes completed quota-interrupted work and generation-budget recovery. The earlier Groq GPT-OSS failure cannot be retrospectively assigned a unique cause from its old coarse record; the current observed transport/contract proof is what establishes usability.

Final full-catalog counts:

| Provider | Ready | Limited | Unavailable | Pending |
|---|---:|---:|---:|---:|
| Groq | 2 | 3 | 6 | 0 |
| Gemini | 3 | 1 | 25 | 33 |
| Cerebras | 2 | 0 | 0 | 0 |
| Ollama | 2 | 0 | 2 | 0 |

Evidence: [provider-matrix.jsonl](checks/provider-matrix.jsonl), [initial inventory](checks/initial-inventory.json), [final inventory](checks/final-inventory.json). Unknown metadata remains testable; specialized entries are not excluded by name alone.

## Rate-limit, resume and corpus evidence

Actual Cerebras Pending qualification resumed and reached Ready. In the real Providers UI, **Continue qualification** then returned **2 / 2 checked · 0 Pending** and retained both last-checked timestamps, rather than re-running fresh passed probes. Automated tests cover provider-wide 429, Retry-After/cooldown, atomic claims, model-specific failures, preservation of passed interrupted probes and no unnecessary retests.

33 actual Groq/Cerebras transport observations were reduced to 23 distinct shape fixtures. Only field names/types, representation and reasoning-presence booleans were captured. Fixture answer values are synthetic. Both valid and invalid shapes are exercised; invalid synthetic payloads are not represented as exact original malformed bytes. Gemini/Ollama were exercised live, but their transport shapes are not in this observed corpus. Additional generic wrapper/semantic cases are tested offline.

Evidence: `tests/fixtures/model-response-shapes.json`, `tests/test_model_response_corpus.py`, [response-shapes.json](checks/response-shapes.json). Raw prompts, API values, final text and hidden reasoning were not stored in the corpus.

## Real runtime acceptance

All submissions below were made in the authenticated actual Studio browser, using ordinary disposable Trees with one Root, one Manager and one Specialist and existing Providers. No mocked progress, status, Provider fallback or model switch. Fast legitimately used the direct Root path; idle Manager/Specialist nodes were not presented as executed.

| Provider/model | Mode | Real Run ID | Core outcome | Duration | Persisted trace / journal events |
|---|---|---|---|---:|---:|
| Groq qwen/qwen3.8-27b | Fast | `27cef84c-0231-40fe-8600-d91b83dea79b` | completed | 395 ms | 26 / 17 |
| Gemini models/gemini-3.1-flash-lite | Fast | `652d3740-79cc-4e11-84bb-c0d9e547ba4d` | completed | 3441 ms | 26 / 17 |
| Cerebras qwen-3.8-27b | Fast | `9ec32a31-a046-4169-9da3-f5a4177b0326` | completed; actual decision repair | 1400 ms | 33 / 24 |
| Ollama phi4-mini:latest | Fast | `738e3e85-cfeb-4755-b01f-09a26923c256` | completed | 7015 ms | 26 / 17 |
| Cerebras qwen-3.8-27b | Deep | `66f42f6d-d78d-4b33-8f54-3b0931287fd5` | completed; Manager passed, Root final pass | 6115 ms | 94 / 63 |

Each Fast result was 42. Each result/Activity view was inspected, recovered by browser navigation/reload and opened through the **same Run ID** in full persisted Execution Trace. Successful Deep was reloaded and its full trace proved capability `comparison`, selected Manager/Specialist IDs, Specialist output, Manager approval, Root final approval and actual final synthesis. Browser-displayed durable journal counts differ from total trace rows because Studio also persists Core trace records; both counts are recorded honestly.

Additional unsuccessful evidence is not counted as full Deep success:

- Groq Deep `95e064f8-cded-42ce-980e-ef09808605fe`: full hierarchy and approved reviews, then `ProviderRateLimitError` in Root synthesis; no final Result. Groq was not retried blindly.
- Gemini Deep `c0173618-a9df-4fee-ba44-0e251a15ffb8`: Partial, 148 trace / 102 journal events, 70.7 s. A comparison subtask passed; a separate review-oriented subtask had no matching Specialist and was skipped. Bounded reviews/revisions remained honest.
- Cerebras Deep `70da4038-72da-4527-9a39-1ad04239f6bb`: Partial, 139 / 94, 15.3 s, for the same unsupported review subtask pattern. Root final accepted the useful comparison, but Core retained Partial.
- The final successful Deep used **one comparison deliverable** aligned with the registered comparison capability. Configuration, routing logic and review validation were not weakened to obtain success. Automatic Manager and Root reviews still ran.

The safe exported evidence contains IDs, source bindings, event types, status, result hashes and review decisions: [runs.json](checks/runs.json). Raw output/state was not exported. Test Trees and their Runs were removed after persistence/trace verification as explicitly requested; these Run IDs are archived acceptance evidence, not links to retained live test records. Original failed evidence Run remains live.

## Browser acceptance

- Providers: all four Connected; actual Ready/Limited/Unavailable/Pending counts; expanded allam capability evidence; triage failed parse; two requests, failed validation and failed bounded repair; safe diagnostic panel readable.
- Resume: Cerebras Continue qualification preserved 2 Ready entries and timestamps; no broad Gemini requalification.
- Builder: Ready qwen selectable. allam selected as Root gave immediate role warning and authoritative `model_role_not_qualified` issue; Save & mark Ready disabled. Restored Root, then selected allam as Specialist: configuration valid and no role block. These checks modified only the disposable draft.
- Provider ↔ Tool: selected Ready Ollama phi4 for the disposable Specialist and attached the existing Artifact Output Tool without executing it. The issue was specifically `provider_tool_incompatible`; phi4 stayed Ready. Binding change was undone, no original Tool/resource changed.
- EN/TH and Light/Dark: qualification diagnostic panel and role guidance inspected in English Light and Thai Dark; returned to English Light. Technical nouns preserved. Builder ended Saved/Configuration valid after Undo. No UI redesign or new motion was introduced; existing focus/reduced-motion behavior retained.
- Playground: actual real Runs, Results, Activity, saved graphs, full trace and browser recovery verified. No prior unrelated Builder/Playground functionality redesigned.
- One mistaken verification URL ending `/builder` reached the existing application fallback. Navigation used the actual `/build` route afterward; no backend failure or product defect was inferred from that unsupported URL.

[15 screenshots and index](screenshots.md) show observed states only.

## Automated engineering verification

| Check | Result | Evidence |
|---|---|---|
| Core full local checkout suite | **805 passed, 5 skipped** (credential-gated live tests) | [core-tests.log](checks/core-tests.log) |
| Studio backend full suite | **417 passed** | [backend-tests.log](checks/backend-tests.log) |
| Studio frontend full suite | **363 passed**, 54 files | [frontend-tests.log](checks/frontend-tests.log) |
| TypeScript | Passed (`tsc -b`) | [typescript-build.log](checks/typescript-build.log) |
| Production build | Passed | Same log |
| Studio and Core `git diff --check` | Passed | Final check after documentation |

Tests explicitly cover safe representations, strict missing fields/references, malformed and ambiguous output, reasoning redaction, bounded negotiation without switches, proven generation truncation, resumed checks/diagnostics, role readiness/runtime alignment and metadata-only filtering. Existing contract, Provider/Tool, Fast/Deep, scheduler and UI tests remained passing. Test fixtures intended to represent fully Ready models now supply complete synthetic capability evidence; production gating was not weakened to satisfy old generation-only fixtures.

The initial Core run had one old expectation that rejected any prose + JSON; the test now rejects two competing objects, with a separate safe single-object acceptance test. Initial backend fixtures with only legacy generation proof failed under the new correct role gate; fixtures were repaired, then the entire relevant suites passed. These intermediate failures were investigated, not concealed.

Core test import explicitly resolves `/home/fluke/Agenttree/src/agenttree/__init__.py`, not a stale installed package. Runtime fingerprints of all five changed compatibility files match the dirty Core checkout: [core-source-proof.json](checks/core-source-proof.json).

Nonblocking pre-existing warnings: Starlette per-request cookies deprecation in one backend test; production index chunk above 500 kB. No unrelated bundling rewrite.

## Docker, logs and stream/network observations

Docker context **desktop-linux**. Only affected backend/frontend images rebuilt and those services restarted; PostgreSQL was not recreated. Final backend/frontend/PostgreSQL healthy. Alembic current and heads both **0014_resource_history**. No migration added. Live backend imports rebuilt compatibility sources.

Browser console capture returned **0 warnings/errors** for both verification tabs: [browser-console.json](checks/browser-console.json). Existing actual Studio create/subscribe/result/replay paths were exercised: real IDs, progressing activity, durable journal records and successful persisted recovery. No duplicate submissions were made by the UI.

Backend/frontend logs after rebuild were inspected through sanitized aggregate matching: no `ERROR`, traceback, authentication/connect error or frontend crash markers. The expected Groq rate-limit is recorded in the persisted disposable failure. The services' captured stdout did **not** include HTTP access records, and the browser tool exposes console capture but not a raw network/HAR inspector. Therefore the empty `http_failures` collection in [log-summary.json](checks/log-summary.json) is **not** proof of a captured all-2xx HTTP trace. Network/stream acceptance here is established at the real UI transaction plus backend durable event/result boundary, not a claim of complete packet/HAR inspection. No network configuration, credential or logging-system redesign was made.

## Database, security and cleanup

Final counts returned to **4 Providers, 79 Models, 3 Secrets, 6 original Trees, 24 original Runs, 1009 original Trace events, 4 Tools, 3 users**. All original IDs remain. One-way row fingerprints are unchanged for all original rows except the **8 intentionally evaluated ProviderModel records**. Providers, encrypted Secrets, Trees/versions/Agents/bindings, original Runs/events/artifacts, Tools, users, API keys and resource history remain byte-equivalent at the row level.

The retained failed Run `ecb0407a-a3b4-4999-af7c-6845241cb8fb` and Tree `20e84a54-30a3-4b8c-9125-ade3e0f27b7c` were checked before and after cleanup. No volume reset, Provider/secret replacement, key regeneration or original resource deletion.

Only four task-created disposable Trees and their eight terminal test Runs were removed through existing TreeService after evidence export. No active execution was deleted. Draft role/Tool experiments were undone before cleanup. [cleanup.jsonl](checks/cleanup.jsonl), [preservation.json](checks/preservation.json) and [final-inventory.json](checks/final-inventory.json) record the result.

Safe diagnostics export no prompts, answer text, hidden reasoning or authorization fields. Scan of these eight Runs' persisted state/event payloads found zero nonempty forbidden credential/reasoning keys; this is a bounded key-based verification, not a general claim to detect arbitrary secrets in free text. Existing auth/permission endpoints are unchanged.

## Task-scoped files and git state

Important existing dirty work remains intact. Task changes are incremental; the complete repository diff also contains earlier work and must not be attributed entirely to this phase.

Core additions/edits:

- `src/agenttree/providers/_adapter.py`, `compatible.py`, `exceptions.py`, `gemini.py`
- `src/agenttree/core/structured_output.py`
- `tests/test_compatibility_boundary.py`, `tests/test_provider_decisions.py`

Studio additions/edits:

- `backend/services/model_capabilities.py`, `model_qualification.py`, `model_discovery_service.py`, `tree_service.py`, `runtime_builder.py`
- `backend/providers/openai.py`
- `frontend/src/lib/provider-models.ts`, `model-role.test.ts`
- `frontend/src/components/tree/provider-model-selector.tsx`, `frontend/src/components/model-compatibility.tsx`
- English and Thai `translation.json`
- `tests/qualification_fixture.py`, `test_model_capability_gating.py`, `test_model_response_corpus.py`, `fixtures/model-response-shapes.json`
- Ready-profile fixture updates in `test_trees.py`, `test_runs.py`, `test_capabilities.py`, `test_phase8a_core_runtime.py`, `test_historical_resource_lifecycle.py`
- This verification directory and pointer in the runtime qualification consistency report.

Final HEADs unchanged: Studio `6fd567422194fee4481a7bfbd8d94dd43e373e49`; Core `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`. Both remain uncommitted/dirty as initially and intentionally required. **Nothing committed, pushed or published.** No reset/stash/clean/checkout. No changes to network, Fast/Deep semantics, runtime orchestration, migrations, readiness beyond capability evidence gating, auth, Learning/A2A or unrelated UI design.

## Known limits and next check

- Ready is synthetic capability evidence, not guaranteed reliability for every task. Real routing can still choose an unassigned review capability and honestly yield Partial, as observed.
- Groq quota can interrupt synthesis; no model fallback or blanket retries hide this.
- 33 Gemini Pending entries remain incomplete and should be continued only when due/quota allows; specialized models need not be made Ready.
- No account-discovered mainstream Llama general model was available for a live matrix entry.
- Observed transport-shape corpus currently covers Groq/Cerebras; Gemini/Ollama live execution does not substitute for adding their sanitized transport fixtures later.
- Optional request negotiation is intentionally narrow; unsupported/untrusted response envelopes and mixed native part arrays remain rejected.
- Five Core credential-dependent tests skipped in the local suite; actual configured service/browser qualification and Runs provide this phase's live evidence separately.
- Raw browser network capture and HTTP access-log inspection were unavailable; actual transactional/stream persistence and console checks passed as described above.

Recommended next check: a small repeatable set of realistic domain-neutral tasks against each demonstrated role, including semantically unsuitable capability choices and provider quota recovery. Keep readiness/evidence honest rather than optimizing for all-green catalog percentages.
