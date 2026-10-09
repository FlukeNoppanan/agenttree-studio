# Modern Industrial Graph UI — real browser evidence

Captured 2026-10-07 from the authenticated, running Docker application at `localhost:5173` using real Chromium. Images are actual viewport captures, not generated mockups. No credentials were revealed. 1920×1080 is the desktop capture size unless the filename explicitly says 1280 or it is the initial before image (1280×720).

## Recommended review set

- [Final Builder, selected Root, Light](screenshots/27-final-builder-root-light-1920.jpg)
- [Final Builder, selected Specialist, Dark](screenshots/29-final-builder-specialist-dark.jpg)
- [Final Builder, Thai/Dark](screenshots/30-final-builder-th-dark.jpg)
- [Real completed Playground Run](screenshots/14-playground-completed-en-light.jpg)
- [Providers, Dark](screenshots/22-providers-en-dark.jpg)
- [Dashboard, Light](screenshots/01-dashboard-en-light-1920.jpg)

## Index

| File | What it proves |
| --- | --- |
| [00-before-dashboard](screenshots/00-before-dashboard.jpg) | Actual pre-revision palette and shell; 1280×720 |
| [01-dashboard-en-light-1920](screenshots/01-dashboard-en-light-1920.jpg) | Neutral landing workspace, compact onboarding, real metrics |
| [02-builder-root-light-1920](screenshots/02-builder-root-light-1920.jpg) | First presentation pass, existing Root Inspector; final reference is 27 |
| [03-builder-focus-light](screenshots/03-builder-focus-light.jpg) | Working Focus Canvas with independently collapsed panels |
| [04-builder-manager-light](screenshots/04-builder-manager-light.jpg) | Actual Manager parent, child count, capabilities and model |
| [05-builder-mcp-light](screenshots/05-builder-mcp-light.jpg) | Actual Basic Tool MCP visual placement and safe resource Inspector |
| [06-builder-tool-light](screenshots/06-builder-tool-light.jpg) | Actual Artifact Output Tool visual placement and safe Inspector |
| [07-builder-specialist-en-dark](screenshots/07-builder-specialist-en-dark.jpg) | Specialist selected in English/Dark; final reference is 29 |
| [08-builder-th-dark](screenshots/08-builder-th-dark.jpg) | Thai instruction text with English product terms; final reference is 30 |
| [09-builder-th-dark-1280](screenshots/09-builder-th-dark-1280.jpg) | 1280×900 graph after Fit; compact toolbar and panels |
| [10-builder-th-light-1280](screenshots/10-builder-th-light-1280.jpg) | Thai/Light graph and Inspector at 1280×900 |
| [11-playground-th-light-1280](screenshots/11-playground-th-light-1280.jpg) | Preserved three-column Playground at 1280×900 |
| [12-playground-en-light-idle](screenshots/12-playground-en-light-idle.jpg) | Explicit existing Tree, real history and Fast/Deep controls before submission |
| [13-playground-run-started](screenshots/13-playground-run-started.jpg) | Real backend Running chip during initial loading; graph/events have not loaded, so this does not prove a Running Agent animation |
| [14-playground-completed-en-light](screenshots/14-playground-completed-en-light.jpg) | Real result 42, Root Completed, unused Agents Idle, real activity and Run ID |
| [15-playground-completed-en-dark](screenshots/15-playground-completed-en-dark.jpg) | Same completed Run and result in Dark |
| [16-playground-completed-th-dark](screenshots/16-playground-completed-th-dark.jpg) | Same Run with localized Thai explanations and English terms |
| [17-playground-reloaded-th-dark](screenshots/17-playground-reloaded-th-dark.jpg) | Result/history/graph restored after browser reload |
| [18-execution-trace-th-dark](screenshots/18-execution-trace-th-dark.jpg) | Full persisted Trace bridge for the same Run ID |
| [19-providers-th-dark](screenshots/19-providers-th-dark.jpg) | Original connection and qualification statuses in Thai/Dark |
| [20-providers-th-light](screenshots/20-providers-th-light.jpg) | Same statuses in Thai/Light |
| [21-providers-en-light](screenshots/21-providers-en-light.jpg) | Same statuses in English/Light |
| [22-providers-en-dark](screenshots/22-providers-en-dark.jpg) | Connected Providers remain distinct from qualification pause/rate-limit waiting |
| [23-dashboard-en-dark](screenshots/23-dashboard-en-dark.jpg) | Dashboard in English/Dark |
| [24-dashboard-th-dark](screenshots/24-dashboard-th-dark.jpg) | Thai section headings and English navigation in Dark |
| [25-dashboard-th-light](screenshots/25-dashboard-th-light.jpg) | Thai/Light Dashboard |
| [26-dashboard-th-light-1280](screenshots/26-dashboard-th-light-1280.jpg) | Operational Dashboard and utility bar at 1280×900 |
| [27-final-builder-root-light-1920](screenshots/27-final-builder-root-light-1920.jpg) | Final single dot pattern, mechanical edges, Root role icon and sectioned Inspector |
| [28-builder-readiness-issues](screenshots/28-builder-readiness-issues.jpg) | Existing Blank Tree's real blockers and disabled Ready action, without editing it |
| [29-final-builder-specialist-dark](screenshots/29-final-builder-specialist-dark.jpg) | Final dark working surfaces, role cues, selection and safe model metadata |
| [30-final-builder-th-dark](screenshots/30-final-builder-th-dark.jpg) | Final Thai/Dark graph after readiness settles |

Temporary resource placements were undone; these images do not claim new resource bindings. Screenshots cannot prove animation. Keyboard movement, Undo/Redo, panel collapse, Auto Layout, Fit and actual Run state updates were exercised in the browser and described in [report.md](report.md).

## Correlation

The Run shown in 13–18 is `bf547813-c03e-4a94-ac30-c37c3fd35a11`, on existing Quick Summary Tree `cafe7aa4-fd9e-406b-b332-424fd70eeaa7`. It completed using local Ollama `phi4-mini:latest`, Fast mode, in 10,883 ms. Full Trace has 30 persisted events; Playground exposes 21 Core/durable events. The two counts describe different existing event collections, not duplicate screenshot simulations.
