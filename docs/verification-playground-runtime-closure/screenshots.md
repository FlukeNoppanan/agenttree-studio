# Real browser screenshot evidence

Previous status: **COMPLETE — ARTIFACT LIMIT FINAL CLOSURE**. Screenshots below were captured from the actual local Studio browser; no events, results or motion were simulated. Filenames preserve capture order. Some earlier capture names imply a state that had already settled; captions below state the actual observed condition. The later **STRUCTURED DECISION RELIABILITY CLOSURE** remains **PARTIALLY VERIFIED**; its five-run browser screenshots have not been captured because no authenticated restricted-user session was established.

Latest retained closure Run: **`30c5fc01-cbc3-41e9-a988-e7af53ad6ac4`** (Studio completed, Core completed, FinalResult.success true, 141 durable events, two artifacts). Screenshots 26–32 record this closure and the focused large Artifact acceptance.

Screenshots 01–25 below preserve the earlier pass, whose last retained Run was `be15f651-5995-4f57-b8da-dd96bd8b9d58` (Studio completed, Core partial, 101 durable events). That partial outcome remains unchanged. Earlier disposable Runs/trees were removed after capture. Prior phase verification directories were not overwritten.

- [01-general-thai-ready.png](screenshots/01-general-thai-ready.png) — General Analysis Ready and required Thai input before a real Playground Run.
- [02-live-general-hierarchy.png](screenshots/02-live-general-hierarchy.png) — Observed real Root activity during the first General Analysis attempt.
- [03-live-manager-specialist.png](screenshots/03-live-manager-specialist.png) — Observed real Manager/Specialist execution, first attempt.
- [04-general-review-live.png](screenshots/04-general-review-live.png) — Observed real Root/Manager review activity.
- [05-general-dark-thai-final-review.png](screenshots/05-general-dark-thai-final-review.png) — Observed bounded revision/review activity in Dark/Thai.
- [06-general-terminal.png](screenshots/06-general-terminal.png) — First General Analysis attempt failed final review; this is failure evidence, not success.
- [07-general-builder-valid.png](screenshots/07-general-builder-valid.png) — Existing General Analysis Builder after same-version collaboration repair; valid configuration.
- [08-cancellation-requested.png](screenshots/08-cancellation-requested.png) — Cancellation settled quickly: screenshot shows actual terminal cancelled, not a frozen request-only state.
- [09-valid-draft-guidance.png](screenshots/09-valid-draft-guidance.png) — Valid configuration still Draft; execution disabled with mark-Ready guidance.
- [10-invalid-collaboration-gate.png](screenshots/10-invalid-collaboration-gate.png) — Invalid collaboration blocked before execution.
- [11-builder-collaboration-blocked.png](screenshots/11-builder-collaboration-blocked.png) — Builder points at invalid Manager collaboration; Ready action blocked.
- [12-provider-rate-limit-safe.png](screenshots/12-provider-rate-limit-safe.png) — Actual safe typed provider rate-limit failure.
- [13-final-live-delegation.png](screenshots/13-final-live-delegation.png) — Earlier Run had already completed when captured; not proof of live edge motion.
- [14-general-result-dark-thai.png](screenshots/14-general-result-dark-thai.png) — Earlier real result, Studio completed / Core partial, Dark/Thai.
- [15-general-persisted-trace.png](screenshots/15-general-persisted-trace.png) — Earlier real result correlated with its persisted 113-event Trace.
- [16-general-result-light-english.png](screenshots/16-general-result-light-english.png) — Earlier partial result and graph in Light/English.
- [17-general-reloaded-result.png](screenshots/17-general-reloaded-result.png) — Earlier result recovered from persistence after actual browser reload.
- [18-real-mcp-completed.png](screenshots/18-real-mcp-completed.png) — Real Gemini hierarchical MCP Run: Core completed, exact arithmetic result 391.
- [19-artifact-real-result.png](screenshots/19-artifact-real-result.png) — Actual Artifact declaration result and persisted metadata, 24 bytes.
- [20-artifact-preview.png](screenshots/20-artifact-preview.png) — Existing Artifact preview interaction; bytes separately verified against stored SHA-256.
- [21-final-browser-live.png](screenshots/21-final-browser-live.png) — Latest required General Analysis Run: actual Specialist activity and live timeline.
- [22-final-general-light-english.png](screenshots/22-final-general-light-english.png) — Latest actual General Analysis result, Core partial, Light/English.
- [23-final-general-dark-thai.png](screenshots/23-final-general-dark-thai.png) — Latest actual General Analysis result, Core partial, Dark/Thai.
- [24-final-reloaded.png](screenshots/24-final-reloaded.png) — Latest Run survived reload with persisted result and 101-event timeline.
- [25-final-run-trace-correlation.png](screenshots/25-final-run-trace-correlation.png) — Loaded full Trace: same final Run ID be15f651..., 101/101 events, truthful partial outcome.

## Motion and transport evidence

Real idle/running/completed/review/revision node states and timeline updates were observed. The brief one-time edge pulse was not captured conclusively; still screenshots must not be treated as proof of motion. No continuous idle animation or fake delegation was added. SSE replay was separately verified using actual HTTP streams and durable cursor IDs (see report). Artifact bytes and MCP successful Tool events were checked against persisted backend state; screenshots alone were not used to infer success.

## ARTIFACT LIMIT FINAL CLOSURE

- [26-artifact-closure-general-live.png](screenshots/26-artifact-closure-general-live.png) — Actual final Run during Root synthesis; Manager/Specialist nodes had settled completed. Real live output and timeline are visible; this does not claim an earlier Manager-start screenshot.
- [27-artifact-closure-general-success-dark-thai.png](screenshots/27-artifact-closure-general-success-dark-thai.png) — Final General Analysis Run reached Core completed without refresh, Dark/Thai, 141 durable events, result and two artifacts.
- [28-artifact-closure-general-success-light-english.png](screenshots/28-artifact-closure-general-success-light-english.png) — Same successful Run in Light/English, real result and final graph state.
- [29-artifact-closure-same-run-trace.png](screenshots/29-artifact-closure-same-run-trace.png) — Real Run detail/Execution Trace navigation: Run `30c5fc01...`, final status Completed, 141/141 durable timeline entries, final and intermediate artifact labels.
- [30-focused-large-artifact-result.png](screenshots/30-focused-large-artifact-result.png) — Focused real Gemini Artifact Run `3784cf09...`: Core completed, 39,342-byte Thai report, 23 durable events. This direct Root branch is separate from the fully hierarchical General Analysis acceptance.
- [31-focused-report-preview.png](screenshots/31-focused-report-preview.png) — Actual existing UI Preview showing the focused Thai report. Full 40-section body, SHA-256, UTF-8 and download equality were verified separately; the artifact was intermediate/history.
- [32-clean-general-reloaded.png](screenshots/32-clean-general-reloaded.png) — Actual Playground reload recovered the same completed General Analysis Run, 70.2 s, 141 durable events, result and both artifacts.

Real SSE reconnect receipts recorded ordered unique IDs 1–8 then 9–141 and terminal `output.final.available` / `run.completed`. The three recovered Tool errors remain in the persisted execution evidence and are explained in report section 15. They are not erased or inferred away from success screenshots.

The focused Tree/Run/artifact folder and test account were removed after capture. General Analysis's successful Run and its two artifacts remain persisted. Post-backend-rebuild integrity verification also passed. Seven new screenshots were added; previous evidence was retained.

## STRUCTURED DECISION RELIABILITY CLOSURE

### Earlier unauthenticated attempt — historical

No screenshot or Run was added during the earlier attempt in which browser attachment timed out. Its safe identification of Run `6dc233f5-4850-4515-995a-7f55f963ecc9` remains historical metadata evidence, not one of the five acceptance Runs. The old suggestion to provision another account is superseded: the existing authenticated Admin session was usable in the latest continuation, with no account or credential change.

### Actual five-run acceptance — 2 October 2026

These are real browser JPEG captures in a new directory, [structured-decision-20261002](structured-decision-20261002/). Earlier screenshots were not overwritten or reused. All five new Runs failed with safe Groq rate-limit errors; none is represented as a successful Gemini execution. The sequence remains **PARTIALLY VERIFIED** because Gemini, Specialists, Manager Review and FinalResult were not reached.

- [01-run1-terminal.jpg](structured-decision-20261002/01-run1-terminal.jpg) — Run `fb51e905…` had already failed when captured: Root completed, Research Manager failed, unreached Agents idle. The original capture name was corrected to avoid implying live motion.
- [02-run2-observed.jpg](structured-decision-20261002/02-run2-observed.jpg) — Run `2ff79c80…` terminal provider rate limit; no result was fabricated.
- [03-run3-start.jpg](structured-decision-20261002/03-run3-start.jpg) — Actual accepted Run `0797d450…`, active submission state; not proof of Agent motion.
- [04-run3-observed.jpg](structured-decision-20261002/04-run3-observed.jpg) — Same Run settled failed at Root after its repair was interrupted by rate limiting.
- [05-run4-start.jpg](structured-decision-20261002/05-run4-start.jpg) — Actual accepted Run `a5ba5cf7…` before the fast external failure.
- [06-run4-observed.jpg](structured-decision-20261002/06-run4-observed.jpg) — Root failure and untouched idle Agents, 11 durable events.
- [07-run5-start.jpg](structured-decision-20261002/07-run5-start.jpg) — Actual fifth submission, Run `b72772c9…`, independent new ID.
- [08-run5-terminal.jpg](structured-decision-20261002/08-run5-terminal.jpg) — Final failed state, safe rate-limit message, no final output, 11 durable events.
- [09-run5-persisted-trace.jpg](structured-decision-20261002/09-run5-persisted-trace.jpg) — Existing Run console reached through Playground's Open Execution Trace, same final Run ID.
- [10-run5-full-trace.jpg](structured-decision-20261002/10-run5-full-trace.jpg) — Full page including persisted Execution Inspector; all 11 events and the failed outcome, no artifacts/result.
- [11-run5-reloaded.jpg](structured-decision-20261002/11-run5-reloaded.jpg) — Reload restored the failed Run under the existing Welcome dialog. This is not a new authentication or snooze flow.
- [12-run5-reload-confirmed.jpg](structured-decision-20261002/12-run5-reload-confirmed.jpg) — Welcome closed; same Run ID, restored input, failed Root, idle unreached Agents and 11 events.
- [13-run1-real-repair-trace.jpg](structured-decision-20261002/13-run1-real-repair-trace.jpg) — Real 38-event Trace with Root triage repair success and subsequent bounded Research Manager provider failure.
- [14-run1-repair-inspector.jpg](structured-decision-20261002/14-run1-repair-inspector.jpg) — Existing timeline with the real repair-success event selected; its details panel is below this viewport.
- [15-run1-safe-repair-metadata.jpg](structured-decision-20261002/15-run1-safe-repair-metadata.jpg) — Actual details for sequence 21: real Root UUID, `triage`, `schema_invalid`, `repair_attempt=1`, `decision_attempt=2`. This proves a real Groq-backed Root repair, not Manager Review or a Gemini repair. No raw rejected response or credential is shown.

Screenshots do not prove sustained animation or independent SSE reconnect. The fast failures were inspected through actual terminal UI, persisted events and reload. Safe timing/count/identity evidence is in [run-evidence.json](structured-decision-20261002/run-evidence.json); warning/error console retrieval returned an empty list in [browser-console.json](structured-decision-20261002/browser-console.json). The earlier successful Artifact/Gemini screenshots remain evidence only for their earlier Runs.

## FULL PROVIDER HEALTH, MODEL QUALIFICATION, AND RUNTIME ACCEPTANCE

**Current status: COMPLETE.** This new successful sequence supersedes the historical five Groq rate-limited Runs above. Earlier screenshots, including the real Root repair, remain unchanged. All captures below are real browser JPEGs in [provider-qualification-20261002](provider-qualification-20261002/).

### Qualification UX and authorized configuration

- [01-before-unusable-model-list.jpg](provider-qualification-20261002/01-before-unusable-model-list.jpg) — Before: normal Gemini catalog mixed usable models with known qualification failures.
- [02-usable-gemini-models-en.jpg](provider-qualification-20261002/02-usable-gemini-models-en.jpg) — After: only six qualified usable Gemini models in the normal English list; diagnostic summary counts remain.
- [03-usable-models-thai.jpg](provider-qualification-20261002/03-usable-models-thai.jpg) — Same usable-only list and natural Thai guidance, with technical terms retained.
- [04-qualified-model-selector-root.jpg](provider-qualification-20261002/04-qualified-model-selector-root.jpg) — Actual Root Model selector contains the six usable Gemini choices; canonical model selected through normal configuration UI.
- [05-homogeneous-gemini-review.jpg](provider-qualification-20261002/05-homogeneous-gemini-review.jpg) — Existing Guided Wizard review for the authorized homogeneous Gemini configuration. Persisted inspection, not this screenshot alone, verified all five final canonical bindings.
- [06-ready-homogeneous-playground.jpg](provider-qualification-20261002/06-ready-homogeneous-playground.jpg) — General Analysis v9 opens in real Playground, Tree Ready, all Agent nodes showing the canonical Gemini model.
- [20-all-provider-usable-catalogs.jpg](provider-qualification-20261002/20-all-provider-usable-catalogs.jpg) — Final expanded real catalogs for all four existing Providers: gemini2 six, groq four, Ollama two, gemini six. No diagnostic failure row becomes a normal model option.

### Smoke and five real sequential full Runs

- [07-smoke-completed.jpg](provider-qualification-20261002/07-smoke-completed.jpg) — Actual smoke Run `07aca1a2…` completed with a real result. Root used its legitimate direct-response branch; full hierarchy evidence follows.
- [08-acceptance-run-1-live.jpg](provider-qualification-20261002/08-acceptance-run-1-live.jpg) — Actual first full Run during execution, with routed Specialist/Tool/review timeline activity. State is from real runtime events, not a simulated sequence.
- [09-acceptance-run-1-completed.jpg](provider-qualification-20261002/09-acceptance-run-1-completed.jpg) — Run `58e7c9fd…` completed, result available, hierarchy settled, 120 durable events.
- [10-acceptance-run-2-completed.jpg](provider-qualification-20261002/10-acceptance-run-2-completed.jpg) — Run `cc2b049c…` completed as a separate second real submission.
- [11-acceptance-run-3-completed.jpg](provider-qualification-20261002/11-acceptance-run-3-completed.jpg) — Run `56e77505…` completed, same saved v9 configuration and exact requested input.
- [12-acceptance-run-4-completed.jpg](provider-qualification-20261002/12-acceptance-run-4-completed.jpg) — Run `c0c3db68…` completed after the third Run had terminated and been inspected.
- [13-acceptance-run-5-completed.jpg](provider-qualification-20261002/13-acceptance-run-5-completed.jpg) — Run `284078e8…` completed, real FinalResult and two artifacts, 120 durable events.

### Persisted result, Trace, artifact body and reload

- [14-final-run-persisted-trace.jpg](provider-qualification-20261002/14-final-run-persisted-trace.jpg) — Playground's existing Open Execution Trace bridge reaches the same final Run ID, Completed, v9, 120/120 events.
- [15-final-result-inspector.jpg](provider-qualification-20261002/15-final-result-inspector.jpg) — Existing persisted Execution Inspector shows the final successful outcome for the same Run.
- [16-full-persisted-trace.jpg](provider-qualification-20261002/16-full-persisted-trace.jpg) — Full-page evidence of the real Run console and persisted Trace/Inspector; event/operation counts were independently checked in backend persistence.
- [17-artifact-body-preview.jpg](provider-qualification-20261002/17-artifact-body-preview.jpg) — Actual existing Preview loads the persisted recommendation report body (17,202 bytes), rather than only artifact metadata.
- [18-completed-run-reloaded.jpg](provider-qualification-20261002/18-completed-run-reloaded.jpg) — Browser reload after the Studio rebuild restores the final successful Run, input, result, graph and 120-event count.
- [19-final-core-rebuild-reloaded.jpg](provider-qualification-20261002/19-final-core-rebuild-reloaded.jpg) — Final browser reload after the Groq adapter fix/backend rebuild again restores the same Run `284078e8-bb6b-4ffe-a58b-b1a292155d69`, completed result/graph, 53.5 s and 120 durable events. This final screenshot was visually inspected.

All five full Runs have `FinalResult.success=true`, four passed Manager Review operations, one passed Root final review, two real Artifact calls and matching Core/Studio IDs. See [report section 17](report.md#17-full-provider-health-model-qualification-and-runtime-acceptance) and [acceptance-summary.json](provider-qualification-20261002/acceptance-summary.json). Ten persisted artifact bodies passed size/SHA-256 verification after the final backend restart.

Still captures prove observed states, not continuous motion or independent reconnect receipts. The actual browser showed live timeline/node transitions and final settling; no new recording or separate SSE reconnect capture is claimed. Final warning/error console retrieval was empty. The existing real repair screenshots above remain the repair evidence; no new repair was artificially induced.
