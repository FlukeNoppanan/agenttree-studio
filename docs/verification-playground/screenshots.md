# Real Chrome screenshots

Captured in actual Studio using a disposable PostgreSQL stack and real Gemini. Existing evidence directories were not overwritten. User-authored test input/model output may be English in Thai UI; this is not translation leakage.

| File | Observed state |
| --- | --- |
| [01-playground-empty-light.png](screenshots/01-playground-empty-light.png) | New independent test — Light |
| [02-playground-empty-dark.png](screenshots/02-playground-empty-dark.png) | New independent test — Dark |
| [03-ready-tree.png](screenshots/03-ready-tree.png) | Explicit Ready Tree and real persisted result |
| [04-test-input.png](screenshots/04-test-input.png) | Real test input |
| [05-run-started.png](screenshots/05-run-started.png) | Fresh real Run started on final deployed source |
| [06-root-running.png](screenshots/06-root-running.png) | Actual Root operation running on final deployed source |
| [10-live-timeline.png](screenshots/10-live-timeline.png) | Actual durable event timeline |
| [11-result-completed.png](screenshots/11-result-completed.png) | Completed real result |
| [11-result-terminal.png](screenshots/11-result-terminal.png) | Earlier failed delegated attempt — actual terminal state |
| [12-structured-result.png](screenshots/12-structured-result.png) | Previously completed real structured result, reopened from persistence |
| [15-full-execution-trace.png](screenshots/15-full-execution-trace.png) | Full persisted Execution Trace opened through the same Run ID |
| [16-run-again.png](screenshots/16-run-again.png) | Run Again prepares an independent new submission |
| [17-not-ready-tree.png](screenshots/17-not-ready-tree.png) | Backend readiness gate with missing Model |
| [19-open-builder.png](screenshots/19-open-builder.png) | Open Builder to resolve configuration |
| [20-failed-run.png](screenshots/20-failed-run.png) | Expected disposable Provider failure |
| [21-cancellation-terminal-observed.png](screenshots/21-cancellation-terminal-observed.png) | Cancellation terminal state observed shortly after request, not a screenshot of the brief requested state |
| [22-light-theme.png](screenshots/22-light-theme.png) | Light Playground |
| [23-dark-theme.png](screenshots/23-dark-theme.png) | Dark Playground |
| [24-thai-playground.png](screenshots/24-thai-playground.png) | Thai Playground |
| [25-english-playground.png](screenshots/25-english-playground.png) | English Playground after language switch |
| [26-builder-to-playground.png](screenshots/26-builder-to-playground.png) | Builder repair → Ready Playground |
| [27-playground-to-connect.png](screenshots/27-playground-to-connect.png) | Existing Connect for the explicit Tree |
| [28-reloaded-completed-run.png](screenshots/28-reloaded-completed-run.png) | Completed Run after reload |
| [29-real-gemini-run.png](screenshots/29-real-gemini-run.png) | Real Gemini Run |
| [30-run-detail-correlation.png](screenshots/30-run-detail-correlation.png) | Run Detail/Trace correlation |
| [31-pinned-historical-version.png](screenshots/31-pinned-historical-version.png) | Immutable historical version after Builder save |
| [32-active-run-reload.png](screenshots/32-active-run-reload.png) | Active browser reload reattachment |
| [33-cancelled-run.png](screenshots/33-cancelled-run.png) | Actual confirmed cancelled Run |
| [34-large-tree.png](screenshots/34-large-tree.png) | 25-Agent overview; zoom/pan available |
| [35-narrow-layout.png](screenshots/35-narrow-layout.png) | 900px stacked layout without page overflow |
| [36-raw-structured-result.png](screenshots/36-raw-structured-result.png) | Raw view of real structured output |
| [37-final-deployment-run.png](screenshots/37-final-deployment-run.png) | Fresh completed Run on final deployed source |

## States not captured

Manager/Specialist Running, multiple active Agents, live delegation edge pulse, Tool activity and real generated artifacts were not observed successfully. No screenshots for these states are fabricated. The cancellation_requested acknowledgement is proven in cancellation-acceptance.json; the runtime reached cancelled too quickly for a reliable separate frame. See motion.md and report.md.
