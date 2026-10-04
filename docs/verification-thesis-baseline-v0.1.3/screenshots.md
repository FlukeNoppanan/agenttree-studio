# v0.1.3 real browser screenshot evidence

3 BEFORE/pause captures and 48 AFTER captures. Authenticated Chromium at localhost; original resources preserved. These are real screenshots, not mockups. Full-page captures may be tall; surrounding application context is retained.

## BEFORE

| Capture | Evidence |
| --- | --- |
| [00-authentication-required.png](before/00-authentication-required.png) | Authentication pause, not Dashboard acceptance |
| [01-dashboard-light-1440.png](before/01-dashboard-light-1440.png) | Genuine old v0.1.2 frontend; candidate backend/data already running |
| [02-dashboard-dark-1440.png](before/02-dashboard-dark-1440.png) | Genuine old v0.1.2 frontend; candidate backend/data already running |

## AFTER

| Capture | Evidence |
| --- | --- |
| [01-dashboard-dark-1440.png](after/01-dashboard-dark-1440.png) | dashboard dark 1440 — earlier iteration; use 27–30/44 for final visual/copy proof |
| [02-dashboard-light-1440.png](after/02-dashboard-light-1440.png) | dashboard light 1440 — earlier iteration; use 27–30/44 for final visual/copy proof |
| [03-dashboard-light-1366.png](after/03-dashboard-light-1366.png) | dashboard light 1366 — earlier iteration; use 27–30/44 for final visual/copy proof |
| [04-dashboard-thai-1366.png](after/04-dashboard-thai-1366.png) | dashboard thai 1366 — earlier iteration; use 27–30/44 for final visual/copy proof |
| [05-dashboard-narrow-thai.png](after/05-dashboard-narrow-thai.png) | dashboard narrow thai — earlier iteration; use 27–30/44 for final visual/copy proof |
| [06-historical-provider-delete-allowed.png](after/06-historical-provider-delete-allowed.png) | historical provider delete allowed |
| [07-historical-provider-deleted.png](after/07-historical-provider-deleted.png) | historical provider deleted |
| [08-current-provider-blocked.png](after/08-current-provider-blocked.png) | current provider blocked |
| [09-history-result-provider-tombstone.png](after/09-history-result-provider-tombstone.png) | history result provider tombstone |
| [10-persisted-technical-trace.png](after/10-persisted-technical-trace.png) | persisted technical trace |
| [11-historical-artifact-preview.png](after/11-historical-artifact-preview.png) | historical artifact preview |
| [12-advanced-reviewed-result-trace.png](after/12-advanced-reviewed-result-trace.png) | advanced reviewed result trace |
| [13-current-tree-browser-run-start.png](after/13-current-tree-browser-run-start.png) | current tree browser run start — actual pending state; not a fabricated Running node |
| [14-current-tree-browser-result.png](after/14-current-tree-browser-result.png) | current tree browser result |
| [15-templates-beginner.png](after/15-templates-beginner.png) | templates beginner |
| [16-templates-advanced.png](after/16-templates-advanced.png) | templates advanced |
| [17-template-required-tool-preview.png](after/17-template-required-tool-preview.png) | template required tool preview — earlier iteration; use 27–30/44 for final visual/copy proof |
| [18-template-import-required-blocker.png](after/18-template-import-required-blocker.png) | template import required blocker |
| [19-wizard-review-real-models.png](after/19-wizard-review-real-models.png) | wizard review real models |
| [20-intermediate-browser-completed.png](after/20-intermediate-browser-completed.png) | intermediate browser completed |
| [21-intermediate-root-direct-trace.png](after/21-intermediate-root-direct-trace.png) | intermediate root direct trace |
| [22-catalog-light.png](after/22-catalog-light.png) | catalog light |
| [23-filesystem-mcp-scope.png](after/23-filesystem-mcp-scope.png) | filesystem mcp scope |
| [24-mcp-registration-form.png](after/24-mcp-registration-form.png) | mcp registration form |
| [25-rotated-secret-delete-allowed.png](after/25-rotated-secret-delete-allowed.png) | rotated secret delete allowed |
| [26-current-secret-blocked.png](after/26-current-secret-blocked.png) | current secret blocked |
| [27-dashboard-final-light-1440.png](after/27-dashboard-final-light-1440.png) | dashboard final light 1440 |
| [28-dashboard-final-dark-1440.png](after/28-dashboard-final-dark-1440.png) | dashboard final dark 1440 |
| [29-dashboard-final-dark-thai-1366.png](after/29-dashboard-final-dark-thai-1366.png) | dashboard final dark thai 1366 |
| [30-dashboard-final-narrow-thai.png](after/30-dashboard-final-narrow-thai.png) | dashboard final narrow thai |
| [31-templates-final-dark-thai.png](after/31-templates-final-dark-thai.png) | templates final dark thai |
| [32-template-optional-resource-thai.png](after/32-template-optional-resource-thai.png) | template optional resource thai |
| [33-import-configured-ready-thai.png](after/33-import-configured-ready-thai.png) | import configured ready thai |
| [34-import-reloaded-builder.png](after/34-import-reloaded-builder.png) | import reloaded builder |
| [35-import-advanced-consistency.png](after/35-import-advanced-consistency.png) | import advanced consistency |
| [36-import-real-playground-run-thai.png](after/36-import-real-playground-run-thai.png) | import real playground run thai |
| [37-connect-regression-dark-thai.png](after/37-connect-regression-dark-thai.png) | connect regression dark thai |
| [38-onboarding-regression-thai.png](after/38-onboarding-regression-thai.png) | onboarding regression thai |
| [39-create-tree-selector-regression.png](after/39-create-tree-selector-regression.png) | create tree selector regression |
| [40-guided-wizard-regression.png](after/40-guided-wizard-regression.png) | guided wizard regression |
| [41-templates-intermediate.png](after/41-templates-intermediate.png) | templates intermediate |
| [42-templates-category-filter.png](after/42-templates-category-filter.png) | templates category filter |
| [43-catalog-dark-thai.png](after/43-catalog-dark-thai.png) | catalog dark thai — earlier iteration; use 27–30/44 for final visual/copy proof |
| [44-catalog-final-dark-thai.png](after/44-catalog-final-dark-thai.png) | catalog final dark thai |
| [45-current-dependencies-dark-thai.png](after/45-current-dependencies-dark-thai.png) | current dependencies dark thai |
| [46-minimal-dashboard-dark-thai.png](after/46-minimal-dashboard-dark-thai.png) | minimal dashboard dark thai |
| [47-minimal-dashboard-light-english.png](after/47-minimal-dashboard-light-english.png) | minimal dashboard light english |
| [48-original-tree-preserved.png](after/48-original-tree-preserved.png) | original tree preserved |

## Acceptance correlation

Provider historical-only deletion: 06–11, real DB assertions `checks/post-ui-lifecycle.json`. Current protection: 08 and 45, HTTP 409 independently verified. Advanced completed review/Artifact: 12 and `checks/alternate-provider-runtime.txt`. Current Run: 13–14. Intermediate completed Root-direct Run: 20–21; it does not prove delegation. Newly imported/saved/reloaded/Advanced-consistent Tree: 33–36; actual Run `45aa66a9-06fd-4e07-b0e8-419cdaa421c6`. Connect/Getting Started/Create selector/Wizard: 37–40. Secret rotation/protection: 25–26. Minimal state and original Tree after disposal: 46–48.

Root-direct idle Manager/Specialist states are truthful. Full Trace includes operation/checkpoint rows beyond durable core events. Disposable Runs/resources were removed after evidence collection; screenshots are historical verification evidence, not a claim that these fixtures remain in the original database. No credential/Secret/ciphertext captures.
