# Real browser screenshots

All images were captured from the actual freshly rebuilt Studio. Images 01–03 use the original authenticated admin session; image 04 records the Sign In screen after that session expired. No mock UI or synthetic screenshot was used. Provider qualification was performed against actual installed Ollama Models. Files are JPEG screenshot output.

| File | Actual observed state |
| --- | --- |
| [01-legacy-models-limited-thai-dark.jpg](screenshots/01-legacy-models-limited-thai-dark.jpg) | Both previous generation-only qualification entries are labelled Limited before new checks; Thai/Dark. |
| [02-qualified-evidence-thai-dark.jpg](screenshots/02-qualified-evidence-thai-dark.jpg) | Genuine qwen Ready and gemma Limited qualification with expanded safe per-check evidence; Thai/Dark. |
| [03-provider-evidence-english-light.jpg](screenshots/03-provider-evidence-english-light.jpg) | Same persisted checks, timestamps and scope caveats after EN/Light switch; both Models fully visible. |
| [04-manual-authentication-required.jpg](screenshots/04-manual-authentication-required.jpg) | Actual Sign In screen after final rebuild/reload, with empty credential fields; blocker evidence only. |

## Not captured yet

The browser session expired before Builder acceptance. There are no claimed Builder warning, Playground, Human/Technical Trace, binding de-duplication or Execution reload screenshots for this task yet. Service-level real Runs and persisted events are documented in report.md and checks/; they are not substituted for browser screenshot evidence.

Remaining screenshots must be captured after user sign-in from the existing verification Trees/Runs. Do not overwrite previous phase evidence and do not fabricate a Limited-model structured failure: the actual new gemma Run produced a partial outcome.
