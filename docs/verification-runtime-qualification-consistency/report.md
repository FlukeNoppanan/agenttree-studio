# Runtime qualification consistency — fix and verification

Status: **PARTIALLY VERIFIED**. Studio/Core tests, Docker, Ollama Fast execution, and persisted Trace were verified. The targeted Cerebras retries did not reach decision qualification, and the live Deep-mode control did not finish before cancellation.

## Exact failed Run

- Run: `d8a68e03-277d-42a3-b7a2-b0307b30e912`
- Tree: IT Troubleshooting, `a477fb2e-6e04-45c0-ab74-8ab12743f5a0`
- Saved version: `50566509-ee0e-4359-9a02-3fd40c78c3fb`
- Mode: `fast`; persisted status `failed`, code `EXECUTION_ERROR`, safe message `Provider execution failed`.
- All five saved Agents use Provider `79d3f0d4-51f5-4f5c-a465-6f387fe080c4`, model `phi4-mini:latest`.
- Version contains five Tool assignments. Root has one executable Tool definition.
- Trace: planning starts, Root decision attempt, operation fails. No provider operation or normalized decision follows.

## Proven failure location

`agenttree.tools.runtime.ToolSession.generate` rejects nonempty Tool definitions when `provider.capabilities.tool_calling` is not true, before invoking the adapter. OllamaProvider explicitly declares `tool_calling=False`.

A read-only reproduction built the exact saved version using RuntimeBuilder, intercepted the Ollama SDK generate method with a counting spy, and invoked ToolSession with the saved Root bindings. Result:

```text
provider OllamaProvider tool_calling False definitions 1
ProviderConfigurationError Selected provider has no declared tool calling support
Ollama SDK calls 0
```

This reproduces the pre-invocation rejection independently of model output. It does not prove historical server access from server logs; it proves the same saved configuration deterministically stops before SDK invocation.

## Qualification/runtime difference

Qualification uses the real Root planning, triage, decomposition and review strategies and their existing normalization/repair boundary. Its evidence explicitly records `tool_calling: not_tested`. It does not create the user Tree's ToolSession/bindings. Runtime does. Both Studio Tree readiness and RuntimeBuilder validation check assigned Tool connectivity but currently omit this Provider tool-calling compatibility check.

Therefore model decision qualification is not the failed boundary. The contradictory Ready Tree is a configuration compatibility validation gap. Removing bindings, downgrading model qualification or silently ignoring Tools would not preserve the intended Tree semantics. No such change was made.

## Running source and endpoint

Backend image `702f4862e721`; frontend image `8587f9a8d0dc`. All three Compose services healthy during inspection.

Installed Core source matches local source for the affected files (SHA-256):

| File | SHA-256 |
| --- | --- |
| providers/ollama.py | 4718b62e2bc9107e29ba654afd58ae097282e2164285dc14a2116f9edddad014 |
| tools/runtime.py | 3aba6e2d22a7bece9bc58ae61a0e9caa6283013eda604b13fcd6c60cc7585aed |
| core/structured_output.py | 33a4ff5793c2c6c32895733a2e096c13dd4cfdf8932842dbc70a81b6d58606d7 |

Installed package location: `/usr/local/lib/python3.12/site-packages/agenttree`. No staleness found in these files; this is not a whole-image source equivalence claim.

From the backend container, configured Ollama endpoint `http://host.docker.internal:11434/api/version` returned HTTP 200, version `0.34.4`. This Provider has no Secret reference, as expected for this local Ollama configuration.

## Fix implemented

- `provider_supports_tool_calling()` centralizes Studio provider-family compatibility using the adapters' declared capability policy. Ollama remains unsupported for bound Tools; OpenAI-compatible, Gemini, Groq, OpenRouter, and Cerebras families are compatible.
- `TreeService.validate()` now emits an Agent-scoped `provider_tool_incompatible` issue for an otherwise-qualified Agent whose Provider cannot execute its bound Tool. EN/TH messages use the existing issue translation pathway. This reports a Tree/Agent configuration issue and does not mutate or downgrade `ProviderModel.qualification_status`.
- `RuntimeBuilder` repeats the static readiness check and, after adapter creation, checks the actual `provider.capabilities.tool_calling` before constructing executable bindings. Its existing ToolSession/runtime rejection remains intact as a final defensive boundary.
- Model decision qualification now prefers `ProviderResponse.structured_content` when supplied and feeds the selected representation to Core's existing `normalize_decision_output()` wrapper-aware normalizer. The synthetic probe still validates its required semantic marker; role/strategy probes keep using Core's canonical validators. No model-name-specific branching was introduced.
- Regression tests cover a safely normalized wrapped response, native structured content, incomplete semantics, provider-independent behavior, Tree-level provider/Tool mismatch, the compatible-provider control, and defensive runtime rejection.

## Automated verification

- Studio backend: **383 passed**.
- Studio frontend: **361 passed across 53 files**.
- TypeScript: passed.
- Production frontend build: passed; Vite reports the existing large-chunk advisory.
- `git diff --check`: passed.
- Core: **790 passed, 5 skipped**. The first parallel run hit a timing-sensitive collaboration timeout; that case passed isolated, and the complete serial run passed. No Core files were edited by this task.

## Docker and live UI verification

- Rebuilt only the Studio backend and frontend services. PostgreSQL was not rebuilt, reset, or volume-deleted.
- Backend, frontend, and PostgreSQL report healthy. Alembic current and heads both report `0014_resource_history (head)`.
- The authenticated real Studio browser opened the original IT Troubleshooting Builder. The UI showed `Needs setup` and five Agent-level Provider/Tool incompatibility issues while the persisted original Tree remained untouched. The original Tree's older listing still labels its stored version Ready; validation now exposes the incompatibility on opening Builder. No attempt was made to save/alter that original Tree.
- Two disposable, no-Tool copies of that hierarchy used the existing qualified Ollama models. Both were marked Ready by backend validation and could be opened in Playground.
- **Real Ollama Fast Run 1:** `phi4-mini:latest`, Run `7f31f66d-05d6-4467-8bda-c10f73942c64`, completed in about 15.9 seconds. Result: “Hello, this is a simple connectivity test.” Playground showed live Root execution and 17 durable events. The persisted Run detail opened with the same Run ID and 26 recorded Execution Trace events. The Run was created through the UI on a Tree pinned to the Ollama Provider; this successful result proves this compatible Ollama adapter path invoked its provider, unlike the old Tool-bound reproduction that failed before the Ollama SDK call.
- **Existing working-model control:** `qwen3:4b` Fast Run `7fb382b3-d397-451b-8d17-a447347b4c02` completed in about 9.6 seconds and returned `control path works.` with 17 durable events.
- **Deep control:** qwen3:4b Deep Run `6a5c6e73-74f8-4ac6-b611-58b039252655` demonstrated Root planning, Manager planning, and Specialist execution on the live graph, but remained in a Specialist generation step for about 96 seconds with no new durable events. I requested cancellation in Studio; persisted status became `cancelled` and the UI showed 40 durable events. This does not establish successful Deep completion. No fix to the separate runtime issue was attempted.
- **Cerebras targeted rechecks:** the two existing models `gpt-oss-120b` and `qwen-3.8-27b` were each retried once from their individual Verify compatibility controls. Both remained `Unavailable`. The updated safe error classification is `incompatible_response` / “Model does not support the required generation request”; neither produced fresh `agenttree_qualification` decision evidence, which indicates failure before those decision-normalization probes. They were not requalified repeatedly. This environment therefore does not establish whether those particular provider/model responses pass the new normalization path.
- The full existing Groq catalogue was left untouched; no Groq calls were made. The `qwen/qwen3.8-27b` model remains previously qualified on Groq.

## Data preservation and cleanup

- Before/after rebuild hashed inventory was identical. After verification, the final credential-excluding inventory matched the baseline for all business/resource/configuration tables, including users, Providers, Secrets, Trees, Tree versions, Agent configurations, Tool bindings, qualification rows outside the two expressly retried models, Runs, and trace events.
- Expected changes: the two specifically requested Cerebras model qualification rows received a new check timestamp and refreshed failure diagnostic while remaining Unavailable; Studio appended one `studio_live.run_cancelled` audit event for the explicit Deep Run cancellation. No original Provider, Secret, Tree, Tree binding, or Run was changed/deleted.
- The two disposable Runtime-check Trees were removed using `TreeService.delete()` after confirming their names and IDs. Their three test Runs (two completed Fast, one cancelled Deep) were removed by the existing Tree cascade. A read-back confirmed zero rows remain for those Tree IDs and Runs.
- No migration was added. No credentials or Secret values were read or printed.

## Logs and repository state

- Studio checkout HEAD at final verification: `6fd5674`. The worktree was already uncommitted when this focused task continued; all such changes were preserved. No commit or publication was made.
- Recent Compose logs showed backend startup/migration informational records and Vite startup; a scan found no traceback, 500, exception, or error entries in the inspected time window. All services remained healthy after the browser runs.
- The current in-app browser automation exposed page accessibility state and screenshots but not a DevTools network/HAR inspector. Backend logs also do not log each successful outbound Provider request. Ollama invocation is consequently proven by the successful Ollama-bound UI Run/result plus the independent earlier SDK-spy reproduction of the old pre-call failure; an outbound HTTP capture was not available.
- Studio contained extensive uncommitted changes before and during this task. They were preserved; no commit or publication was made. Relevant files for this fix include `backend/providers/generation.py`, `backend/services/model_qualification.py`, `backend/services/tree_service.py`, `backend/services/runtime_builder.py`, `frontend/src/pages/trees/tree-builder.tsx`, EN/TH translation JSON, and focused backend tests. Other dirty changes are from the pre-existing Studio worktree and were not reset or cleaned.
- `/home/fluke/Agenttree` remains dirty from pre-existing user work (protocol/decision changes listed by `git status --short`). This task made **no Core edits** and did not clean or overwrite those changes.

## Remaining limitations

1. The two target Cerebras models did not reach decision probes: their initial generation request was rejected. The actual models remain Unavailable; no claim is made that response normalization qualifies them.
2. The qwen3:4b Deep Run did not complete within the observed 96 seconds and was safely cancelled. Fast mode was verified with both phi4-mini and qwen3.
3. Browser DevTools network/HAR and browser console logs were unavailable in the connected in-app-browser surface. Compose logs and live UI/Trace state were inspected.
4. There were no migrations; existing DB data was retained apart from the two explicitly retried qualification rows and the expected cancellation audit event described above.

## Cerebras Model Compatibility — focused follow-up (2026-10-06)

Status: **PARTIALLY VERIFIED**. The generation-stage cause was reproduced and corrected generically. A post-fix qwen qualification confirms generation works, but its real decision probes did not demonstrate Root delegation or Manager routing. The gpt-oss qualification was paused by an explicit Cerebras rate limit. Neither model met the evidence needed to start the requested real Fast Runs; no Run or disposable Tree was created for this follow-up.

### Original generation failure and exact cause

The earlier phrase “Model does not support the required generation request” was Studio’s sanitized classification; it was **not** a Cerebras HTTP rejection. The call went through `backend/services/model_discovery_service.py::_verify_generation()` into the Core `CerebrasProvider` OpenAI-compatible `/v1/chat/completions` adapter. The probe asked for a short exact response (`Reply with exactly OK`) with `temperature=0` and `max_tokens=8`. There were no `response_format`, JSON schema, `tools`, `tool_choice`, reasoning options, or provider-specific options in this probe.

For both target models, Cerebras returned HTTP 200, but the response had a reasoning field with no final `content`, `finish_reason=length`, and the full eight completion tokens consumed. The adapter correctly rejected the absence of final text as `MalformedProviderResponseError("Provider returned no text response")`; Studio then persisted the misleading generic `incompatible_response` classification. This is an AgentTree probe-budget issue, not an unsupported Cerebras request feature.

As a controlled diagnostic, the same provider adapter, model, prompt, temperature and non-streaming request with only the completion cap changed to 64 returned final text and `finish_reason=stop` for both models. The observed completion counts were 56 for gpt-oss-120b and 27 for qwen-3.8-27b. Reasoning contents and credentials were deliberately not retained or printed. This establishes that no model-name routing or request-format fallback is needed.

### Generic fix

`backend/services/model_discovery_service.py` now defines `GENERATION_VERIFICATION_MAX_TOKENS = 64`; the shared `_verify_generation()` uses this bounded cap instead of eight, leaving room for a reasoning preamble and the short verification answer. It applies uniformly to generation probes and does not inspect model IDs. No model-name whitelist/special-case was added. The existing shared normalizer and decision qualification contract remain the source of truth; no synthetic Ready status or fallback was introduced.

### Targeted real qualification outcomes

- **qwen-3.8-27b:** the Providers page reported **Limited** after the post-fix targeted verification (checked 2026-10-06 09:12:44 local). The UI explicitly reported “Generation works, but decision checks have not all passed.” Persisted visible evidence: Root planning failed because delegation was not demonstrated; Manager decomposition failed because routing was not demonstrated; Root Final Review, Manager Review, Structured Output, and Capability routing passed. This is a genuine semantic qualification result, not the prior generation-probe failure. Since it did not demonstrate required hierarchy decisions, no Agent binding or real Fast Run was attempted.
- **gpt-oss-120b:** the targeted verification entered resumable **Pending** qualification, then the Providers page reported “Provider rate limit; retry later.” The retry-after time advanced from 09:12:24 to 09:14:16 local after a single permitted resume attempt. The visible evidence therefore does not establish completed decision qualification. Its request had already passed the former short-output failure in the diagnostic, but the full qualification cannot be claimed. No Agent binding or real Fast Run was attempted.
- The UI continued to show Cerebras as Connected; its model counts after the follow-up were 0 Ready, 1 Limited, and 1 Pending. Existing Providers and Secrets were not edited. No other models were requalified.

### Verification and data safety

- Focused Studio backend tests: `tests/test_model_qualification_failures.py` and `tests/test_structured_model_qualification.py` — **28 passed**. Added a generic regression asserting the generation probe allows 64 tokens while retaining the exact prompt and temperature and sends no structured-output/tools/provider-option fields.
- Frontend suite: **361 passed**; production build (including `tsc -b`) passed. The build retains the existing advisory about the large main bundle. `git diff --check` passed.
- Full-suite attempts in this continuation are not claimed as passing: Studio backend full-suite execution was interrupted after it produced no further output; the focused backend suite above passed. Core full-suite collection used the environment’s installed `agenttree` package rather than the dirty checkout source and reported three import/collection errors (including missing symbols present only in the uncommitted source); the run was stopped after further failures. No Core source was edited. A standalone `npm run typecheck` command is not defined; TypeScript checking did run as part of the successful production build.
- The Studio backend image had already been rebuilt for this change without rebuilding PostgreSQL or deleting volumes. At the beginning of this continuation, Docker CLI access to the Desktop socket was denied, so a fresh service-health/migration/log read was unavailable here; do not interpret the earlier healthy Docker report as a new post-retry health check.
- No database volume reset, migration, credential display, Provider/Secret mutation, Tree creation, or Run creation occurred. The two requested Cerebras qualification records were the only intended provider state touched. Ollama’s existing `phi4-mini:latest` and `qwen3:4b` Ready states remained visible in the UI.
- Real browser verification used the authenticated Studio Providers page. The UI surfaced qualification results and the explicit provider-rate-limit message. This session did not have a browser network/HAR inspector; the exact provider HTTP evidence above came from the earlier direct adapter/provider diagnostic. No new outbound provider calls were made after the rate-limit pause.

### Acceptance status

**Code fix verified; end-to-end model usability remains blocked/partially verified.** qwen’s generation is fixed, but it is Limited for missing delegation/routing behavior. gpt-oss’s qualification is still pending because Cerebras rate-limited the verification. Accordingly, neither real AgentTree Fast Run, Run ID, persisted Run result, nor matching Execution Trace can be reported for these two models. Do not report this focused Cerebras task as COMPLETE unless later genuine qualification permits both requested Fast Runs and their persisted Trace checks.

### Real qwen Limited Specialist follow-up (2026-10-06)

A real Studio Fast Run was attempted on the disposable Tree `Disposable Cerebras Qwen Specialist Check` after the qwen Specialist model was selected in the actual Builder. This confirms Limited is selectable and can pass Tree readiness in a Specialist configuration; no model fallback was observed. The Tree used the already-verified local Ollama Root and Manager so that the Cerebras model was assigned only to the Specialist.

- Run ID: `ecb0407a-a3b4-4999-af7c-6845241cb8fb`.
- Persisted Run detail and full Execution Trace reopened in Studio with the same ID after navigation/reload. The durable Trace contains **140 events** and records Root planning/capability routing, Manager decomposition/review, multiple Specialist operations, and Root final review. The Execution Inspector records the pinned Cerebras `qwen-3.8-27b` binding and an observed Specialist generation identity for the Cerebras Provider connection.
- The Specialist was genuinely invoked, but its provider operations repeatedly failed; Manager revisions followed and Root final review rejected the workflow. The persisted Run status is **Failed**, elapsed about **41.9 seconds**, and no final result was recorded. Thus this is real invocation evidence, not a successful Fast execution.
- The persisted operation-failed event has an empty safe `message` and only a generic `status: failed`; the UI’s safe execution diagnostic is `Tree did not pass final review; inspect Execution Trace for failed Agent results`. It does not retain the raw provider response or a useful failure reason. We therefore cannot classify this runtime failure more specifically without provider/backend diagnostics. No additional Cerebras call was made to investigate it.
- The earlier exploratory Run `22392196-4a0b-479c-b9fc-43303fa5b790` completed, but its selected Specialist remained idle; it is not counted as a qwen execution.

This updates the earlier note that no disposable Tree or Run was created: one disposable Tree was created and two Runs exist under it. The pending cleanup is limited to that named Tree and its associated verification Runs; no Provider or Secret was touched. The earlier qualification evidence still stands: qwen is **Limited** because Root delegation and Manager routing were not demonstrated; gpt-oss remains **Pending** due to Cerebras rate limiting. The generic 64-token generation fix and prior focused test results remain unchanged. Overall status remains **PARTIALLY VERIFIED** because neither requested model has a successful qualifying real Fast Run, and the gpt-oss qualification remains rate-limited.

### Connectivity and persisted qwen failure follow-up (2026-10-07)

The new instruction explicitly preserves Tree `20e84a54-30a3-4b8c-9125-ade3e0f27b7c` and Run `ecb0407a-a3b4-4999-af7c-6845241cb8fb` as debugging evidence. They have **not** been deleted. No new Cerebras/Groq connection test, model qualification call, or Run was started.

#### Cerebras/Groq connection status

- The supplied latest Providers-page observation is that both Cerebras and Groq show `could not connect to server`, while Ollama remains connected.
- Studio's discovery adapter maps `httpx.ConnectError` to that fixed safe diagnostic. It maps an HTTP error response separately as `server returned HTTP <status>` and identifies `httpx.ProxyError` as `proxy connection failed`. This places the observed failure at the connection/transport stage before a normal HTTP response; by itself it does **not** identify DNS, socket reachability, proxy, or TLS as the root cause, and it does not prove invalid credentials.
- Both provider types use the same Studio `OpenAIAdapter` with their respective configured OpenAI-compatible API base URLs. Their shared UI failure therefore fits a shared backend outbound/transport/environment issue, but the exact cause cannot be distinguished from available evidence.
- One Docker access check was attempted on 2026-10-07 and failed with permission denied for `/home/fluke/.docker/desktop/docker.sock`. It was not retried. No backend process or listener was available at `localhost:8000` from this execution environment. Consequently, the running container's DNS/proxy/TLS configuration and backend logs could not be inspected. No code or credentials were changed. **Connectivity root cause remains unverified.**

#### Run `ecb0407a-a3b4-4999-af7c-6845241cb8fb`

- The persisted Execution Detail reopened after navigation and showed the same Run ID, status **Failed**, elapsed **41.9 seconds**, and **140 recorded events**. Its pinned version is Tree v2. Bindings show Local Root and Local Comparison Manager on the existing Ollama test Provider/model and Cerebras Qwen Generation Specialist bound to Cerebras `qwen-3.8-27b`.
- Root planning and capability routing completed; the Manager decomposed the task. The event timeline and saved hierarchy show the Specialist was reached. The Execution Inspector includes observed Specialist generation identity for the Cerebras Provider connection. No fallback to Ollama occurred for this Specialist.
- The first durable Specialist failure appears at event sequence **33**, `operation.failed`, with `operation_type: provider.generate`, `attempt: 1`, and `status: failed`. Further Specialist failures are present at sequences 39, 45, 51, 57, and later after Manager revision. The exposed event payload's message is empty; it contains no HTTP status, provider exception class, raw ProviderResponse, model text, normalized value, or validation diagnostic. Sensitive/raw output is not retained in the displayed evidence.
- After the Specialist failures, the Manager continued review/revision activity and Root performed final review. The final `execution.failed` event is sequence **140**; Studio reports only `Tree did not pass final review; inspect Execution Trace for failed Agent results`, with no final Result recorded.
- Evidence-supported classification: the Specialist `provider.generate` operation failed before a successful Specialist outcome was recorded; Manager review/revision and Root final review followed, and the overall Run then failed. The evidence is **insufficient to distinguish** Cerebras invocation/transport failure from response extraction, normalization, or Specialist contract failure. It does not establish an HTTP success, final model content, successful normalization, or canonical Specialist validation. Therefore do not attribute the failure specifically to qwen's semantics or claim the exact low-level failure cause.

#### Scope and status

- No product code change was made in this continuation because the persisted event data does not prove a specific normalizer/contract defect, and live backend logs were inaccessible. No retry was made to obtain missing evidence.
- No Provider, Secret, original Tree, Tool, qualification record, DB volume, or Core file was modified by this continuation. The verification Tree and its two Runs remain available for debugging as requested.
- Browser DevTools network/HAR was not available; the browser session was unauthenticated when reopened in this continuation. Docker was blocked by the socket permission above. Core remains dirty from pre-existing work and was not modified.
- Status remains **PARTIALLY VERIFIED**. The 64-token generation-probe correction is verified and Limited Specialist selection/readiness is verified, but the required successful qwen Specialist Fast Run is not. gpt-oss remains Pending/rate-limited. The precise shared Cerebras/Groq connectivity cause and the low-level qwen provider-operation failure both require accessible runtime logs or equivalent sanitized diagnostics before any further provider call or code change.

## Cloud Provider Connectivity (2026-10-07)

Status: **PARTIALLY VERIFIED; no connectivity fix applied.** This check was limited to runtime/configuration inspection. It did not call any Provider, alter records, or restart services.

- **Root cause:** Not proven from this shell. The previously observed UI message `could not connect to server` maps in `backend/providers/http.py` to `httpx.ConnectError`, indicating failure before a normal HTTP response, but it does not distinguish DNS, TCP route, proxy, or TLS.
- **Runtime context:** `compose.yaml` defines the actual architecture as a backend container listening on port 8000 and a frontend container whose `/api` proxy target is `http://backend:8000`. The active Docker CLI context is Docker Desktop at `unix:///home/fluke/.docker/desktop/docker.sock`. The only allowed Docker attempt returned permission denied. The configured `default` context points at `/var/run/docker.sock`, which does not exist. The host shell sees only its own restricted sandbox processes; nothing listens on local TCP port 8000. Thus this shell is **not** the backend container's network context and cannot establish which running container/process served the Studio page.
- **DNS/TCP/TLS/HTTPS/provider endpoint from backend:** Not tested; inaccessible runtime. No conclusions are inferred from host/browser internet access.
- **Proxy/environment:** Host-shell inspection found no matching proxy or CA environment variable names, but this says nothing about the isolated backend container. Compose explicitly lists backend environment entries and does not explicitly pass HTTP(S)_PROXY, ALL_PROXY, NO_PROXY, or custom CA variables. Container-injected/runtime values and `/etc/resolv.conf` were not accessible.
- **Adapter configuration:** Gemini uses `https://generativelanguage.googleapis.com/v1beta/models`; Cerebras and Groq use the shared OpenAI discovery adapter with their official OpenAI-compatible base URLs. The shared adapter creates `httpx.Client(timeout=15.0, follow_redirects=False, trust_env=True)` when no client is injected. Source inspection found no custom HTTP transport or verify override in the discovery path. This is not proof of actual container DNS, proxy, or TLS health.
- **Ollama comparison:** Ollama deliberately disables environment-proxy inheritance only for explicitly loopback endpoints. The actual configured Ollama base URL is stored in the inaccessible database, so whether it targets localhost, `host.docker.internal`, or LAN cannot be verified from this shell.
- **Fix/restart:** None. No application code or runtime configuration was changed; no restart was attempted.
- **Real Studio Test Connection:** Not performed in this continuation. Reported status from the user: Gemini, Cerebras, and Groq fail with `could not connect to server`; Ollama is Connected. This report does not claim these results were freshly re-tested.
- **Data preservation:** No database access/reset, Provider/Secret mutation, qualification change, Tree/Run mutation, or Core edit occurred. The important failed Run and its verification Tree remain retained.
- **Exact access blocker/action needed:** The current managed shell cannot access Docker Desktop's socket despite the CLI context being selected; the default Docker socket is absent. Run the following from a host terminal with the user's normal Docker Desktop permissions and provide the sanitized output (do not include environment values or secrets): `docker compose ps`, `docker compose logs --since=15m backend`, and for a single controlled diagnostic use `docker compose exec backend python -c 'import socket,ssl,urllib.request; h="generativelanguage.googleapis.com"; print("dns", socket.getaddrinfo(h,443)); s=socket.create_connection((h,443),10); print("tcp443",s.getpeername()); t=ssl.create_default_context().wrap_socket(s,server_hostname=h); print("tls",t.version()); r=urllib.request.urlopen("https://generativelanguage.googleapis.com/",timeout=15); print("https",r.status)'`. The endpoint may return an expected HTTP error without an API key; transport evidence is the point. Equivalent checks should then be run against `api.cerebras.ai` and `api.groq.com` only after the first result is reviewed. Do not run the three live Studio Test Connection actions until the backend transport cause is understood.

No new backend/frontend tests were needed because no source changed. `git diff --check` was run and passed. The Studio and Core working trees remain dirty from existing work; nothing was reset, stashed, cleaned, or checked out.


## Model compatibility hardening — 7 October 2026

**COMPLETE** for the subsequent bounded Provider interoperability phase. See [full hardening report](../verification-model-compatibility-hardening/report.md) for the shared compatibility/role gating changes, 11-model curated matrix (5→9 Ready), actual four-Provider Fast Runs and successful Cerebras Deep hierarchy, 805 Core / 417 backend / 363 frontend passing tests, browser evidence, preserved original database and scoped disposable cleanup. Original failed Run `ecb0407a-a3b4-4999-af7c-6845241cb8fb` remains retained. Ready is not a task-quality guarantee; existing Gemini Pending models, semantic Partial outcomes and network-capture tooling limits are documented honestly. No publication or destructive reset.
