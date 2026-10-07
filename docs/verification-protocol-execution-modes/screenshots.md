# Real browser evidence

All images below were captured from the actual authenticated Studio frontend
against the real Docker/runtime/database. No generated or mocked screenshot is
used. Evidence was saved before disposable Trees/Runs were cleaned up.

## Acceptance captures

| Image | What it proves |
| --- | --- |
| [01 — Fast default](screenshots/01-fast-empty-light-en-1920.jpg) | Actual empty Playground, compact selector, unchanged three columns at 1920×1080 |
| [02 — Ollama Fast completed](screenshots/02-fast-completed-ollama-light-en.jpg) | Root direct result, other Agents idle, actual Fast Run ID |
| [03 — Ollama Deep activity](screenshots/03-deep-running-ollama.jpg) | Observed real hierarchy activity; this supplemental Run was later cancelled |
| [10 — persisted Groq trace](screenshots/10-groq-persisted-execution-trace.jpg) | Same successful Deep Run in full persisted Execution Trace |
| [12 — Ollama Deep cancelled](screenshots/12-ollama-deep-cancelled.jpg) | Actual cancellation after prolonged provider work; no final result fabricated |
| [13 — Phi4 supplement cancelled](screenshots/13-phi4-deep-cancelled.jpg) | Explicit additional qualified-model test cancelled, not counted as success |
| [15 — Light/English at 1280×900](screenshots/15-deep-light-en-1280-confirmed.jpg) | Restored successful Deep result and existing responsive stacked panes |
| [16 — Run Again rate limit](screenshots/16-run-again-provider-rate-limit.jpg) | New independent Run ID and real provider failure; Deep did not fall back |
| [17 — Dark/Thai at 1280×900](screenshots/17-deep-dark-th-1280-confirmed.jpg) | Natural Thai explanation with English technical terms; same historical result |
| [18 — final Dark/Thai at 1920×1080](screenshots/18-final-deep-dark-th-1920.jpg) | Three columns, selected Deep, comparison branch completed, translation branch idle |
| [19 — final Light/English at 1920×1080](screenshots/19-final-deep-light-en-1920.jpg) | Same graph, result, controls and activity in Light/English |

The 1280 viewport's client/screenshot width is 1265 px because its vertical scrollbar
uses 15 px. Full-page captures exceed 900 px in height. Actual viewport geometry,
including client height **900**, is recorded in
[browser-viewport-1280.json](checks/browser-viewport-1280.json). The three-column
1920×1080 geometry is recorded in
[browser-viewport-1920.json](checks/browser-viewport-1920.json).

## Earlier observations retained

Images 04–09, 11 and 14 are genuine intermediate reload/theme/fit observations.
They are retained rather than substituted for final evidence. In particular,
05 used the normal 1265×712 client viewport, and 14 remained at 1920×1080 on a
background tab. They are not claimed as the final 1280×900 acceptance. Captures
15/17 and their measured geometry provide that evidence.

## Motion and live behavior

Actual Root/Manager/Specialist status changes and Activity entries were observed
during real Runs, including repeated review activity on the supplemental Ollama
Run. Screenshots are static evidence of those observed states, not proof of a
fabricated fixed animation sequence. No new mode-specific animation was added.
Reduced-motion behavior remains in the existing graph/UI motion system.

Browser reload reattached to an active Ollama Deep Run and restored its real mode
and activity. Completed Groq Deep reloaded with the same ID, result, selected Deep
and final graph. Its Translation branch stayed Idle. Cancellation reached actual
backend-confirmed `cancelled`; provider rate limit produced an actual failed Run.

The final [report](report.md) and
[persisted runtime evidence](checks/runtime-evidence.jsonl) record all Run IDs,
durations and event counts. Disposable Run URLs intentionally no longer resolve
after cleanup; these local evidence artifacts preserve the verification.
