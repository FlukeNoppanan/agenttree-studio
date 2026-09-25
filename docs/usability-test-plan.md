# AgentTree Studio usability test plan

## Purpose and participants

Evaluate whether people can find and complete Studio's implemented workflows without coaching. Recruit 9 people: 3 developers new to agent builders, 3 developers experienced with workflow/agent tools, and 3 administrators or platform engineers. Give every participant the same eight task prompts, the same disposable workspace data, and comparable permissions. Use a moderator-provided Admin account for task 7; do not ask participants to share real credentials.

The study is moderated, task-based, and does not add telemetry. Record screen and audio only with consent. Use disposable Secrets, providers, Tools, Trees, Users and API keys; clean up only those records after each session. Preserve security audit events and all pre-existing data. Do not use production credentials or send a real Secret to an untrusted endpoint.

## Setup

- Use a healthy Studio deployment and note the build/version, browser, viewport, language, and participant group.
- Provide a disposable standard user with access to the required starter Tree and a disposable Admin for task 7. For provider and MCP tasks, prepare approved test endpoints and a Docker-compatible Filesystem MCP path under `/workspace`.
- Prepare one sample Secret value, one test Provider with a discoverable model, one MCP connection, and a short Tree task prompt. The moderator may reset these **disposable** fixtures between participants.
- Explain that Studio currently supports synchronous Tree invocation. Do not describe a long-running Tree Runtime, Public API V1, Blocks, or collaboration between Managers as available.
- Ask the participant to think aloud. Give the task goal, not click-by-click instructions. Record when help is requested; do not intervene silently.

## Eight comparable tasks

| # | Starting state | Goal | Expected successful result |
| --- | --- | --- | --- |
| 1. Sign in and inspect Account | Signed out; provided disposable user credentials | Sign in, complete forced password change if prompted, find Profile, Security and Tree Access | Account shows the persisted username/role and correct effective Trees; participant can find password change and sign out |
| 2. Add Secret and Provider | Signed in with Secret and Provider management permissions | Save the provided test credential and configure a Provider reference | Secret value is not displayed after save; Provider references that Secret and remains visible after reload |
| 3. Verify Provider models | Test Provider configured; approved endpoint reachable | Test connection, discover/verify models and identify a Ready model | Connection result and real discovered model status are clear; Ready model is identifiable for Tree use |
| 4. Connect MCP Tool | Signed in with Tool management permission; approved Filesystem MCP endpoint/path supplied | Add the MCP connection, test it and inspect discovered tools/schema | Real tools are returned; participant can inspect names and required inputs; no host-wide filesystem path is used |
| 5. Create Tree | Ready model and Tool available | Build a Root → Manager → Specialist Tree, save draft, validate it | Three-level hierarchy and assignments persist; readiness result is understood |
| 6. Inspect and edit Tree | Disposable Tree from task 5 | Open Tree Detail, inspect an Agent, edit the Tree and find the new version | Agent drawer shows configuration; edit is saved as a validated new version without losing the previous one |
| 7. Manage user access | Switch to provided Admin account; two disposable Trees and a disposable user available | Set `Can use Trees`, select one Tree, then switch the user to All Trees and back | Admin sees the distinction between explicit grants and current/future access; saved values reload correctly; normal user cannot self-grant |
| 8. Create API key and inspect execution | Disposable user with Tree access; disposable Tree ready | In Account, create a named API key, copy it once, then inspect a Test Run and its Live View/trace | Plaintext appears only in the creation result; Run/Live View show persisted execution facts; participant does not infer an unsupported long-running runtime |

Tasks 2–5 depend on the approved test services being available. If an external service fails, mark the task *blocked by environment* separately from user failure and do not fabricate a successful connection.

## Observer sheet (one row per participant × task)

Record participant ID/group, task number, language, starting state, completion (Yes/No/Blocked), completion time, number of errors, number of misclicks, help required (Yes/No), verbatim user comments, observed confusion, and environmental failures. Count an error when an attempted action produces a failed or incorrect result; count a misclick when navigation or control selection is unintended. Start timing when the prompt is finished, stop at the expected result or when the participant gives up. Note the first wrong turn and recovery path.

After each task ask: “What did you expect to happen?” and “What was unclear?” At the end ask which area was hardest to locate, whether API key scope and one-time display were understood, and what the participant believed Live View represents. Compare completion rate, median time, help rate, and recurring confusion by group; prioritize issues that block multiple participants. Keep any follow-up product changes separate from this study's raw observations.
