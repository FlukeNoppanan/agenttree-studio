# Onboarding UX revision — verified

Verification date: 2026-10-01. Status: **COMPLETE for this UX revision**. Existing integration and onboarding work was already uncommitted at entry and has been preserved. This report distinguishes the revision from those earlier changes.

1. **Initial audit:** inspected git status and latest ten commits (Studio HEAD `4086b80`), current shell, authentication guards, Dashboard, guide, routing, theme tokens, localization, setup/workspace, Run/Trace/Connect, storage and permissions before changing code. See [audit](audit.md).
2. **Existing architecture:** retained `/api/dashboard/me` onboarding facts, backend readiness, successful-Run rules, existing preference keys, i18next, Radix dialogs and navigation. The old large Dashboard checklist and first-matching Tree choice were the UX problems.
3. **Welcome:** authenticated shell entry opens a concise introduction with the shared Root → Manager → Specialist explanation, language selector, tutorial and Dashboard actions. No advertisement, chatbot or permanent dismissal.
4. **Snooze:** selection applies when Welcome closes, including an action, Escape or close button. Session uses account-specific sessionStorage; Today expires at the next browser-local midnight; 3/7/14 expire after exactly that many 24-hour intervals. Timestamp storage is namespaced and finite; malformed/unavailable values are safe. No selection creates no persisted suppression. Getting Started remains accessible.
5. **Tutorial:** dedicated `/getting-started` page has six sections, progress and refresh. Mental model precedes Provider, Tree, configuration, Run and Connect. Provider/Model/optional Tool explanations are included. Template is recommended; Blank Tree remains available. Resource progress is not reset. Only mental-model acknowledgement and an existing Ready-Tree Connect visit are UI acknowledgements.
6. **Dashboard:** replaced the large guide with a compact progress card and Continue link after the page header. Operational Overview, recent Runs and actions remain visible and useful for established users.
7. **Picker:** zero eligible Trees explains prerequisites; one shows its name beside the action; multiple opens a dialog requiring explicit selection. Names, Templates and backend readiness are shown. No new Tree API or guessed selection.
8. **Configure:** uses existing management scope and opens the selected Tree's `/setup` workspace. Chrome selected Tree B explicitly among three Trees.
9. **Run:** Ready Trees are intersected with current granted `available_trees`; requires use and execution-view permissions. Chrome selected Tree B and ran it through existing Live View.
10. **Connect:** uses granted Ready Trees and existing management/use permissions, then opens the selected Tree's existing Connect tab. Chrome explicitly selected Tree A. Personal API Key creation is not required for tutorial completion.
11. **Theme audit:** dialogs/cards previously shared surfaces, input surfaces lacked hierarchy and sidebar accents included hardcoded colors. Shared tokens are now used for the important surfaces and sidebar offenders.
12. **Dark:** navy background `#18243A`, card `#22314B`, elevated `#2C3E59`, distinct sidebar/input surfaces, stronger visible borders and readable muted text. Shared dialog shadow reinforces elevation.
13. **Light:** tinted application background `#E8EDF4`, soft card `#F5F8FC`, white elevated dialogs and distinct inputs. White is reserved for appropriate elevated surfaces rather than the whole application.
14. **Localization audit:** reused current EN/TH resources and i18next. Reviewed priority onboarding, navigation, Providers, empty states, contextual explanations and Connect copy. Literal Provider model “candidate” wording and trace explanations needed correction.
15. **Thai:** independently authored Welcome/tutorial/picker guidance and concise explanations, retaining recognizable technical terms. Clarifies Agent delegation, Model readiness, optional Tools, actual Execution Trace and incoming versus outgoing Webhooks. Provider model wording is natural Thai.
16. **English:** concise tutorial, Welcome, selection and integration explanations. No technical V1/V2 choice is imposed on beginners. Both locales switch live; the language selector intentionally retains “English” and “ไทย”.
17. **Permissions:** no authorization changes. Existing setup management scope is preserved; Run/Connect filter by grants and readiness. Restricted CTAs and inaccessible Ready Trees are covered by automated tests. No credentials are stored in onboarding preferences.
18. **Files changed in this revision:** listed below. Earlier dirty backend/integration files belong to previous phases, not this revision.
19. **Backend:** no backend changes for this revision. Existing Dashboard facts, runtime and Public APIs reused.
20. **Migrations:** no new migration. Existing `0012_webhook_integrations (head)` verified in both Docker projects; no database reset.
21. **Backend tests:** 224 passed, one existing Starlette cookie deprecation warning. Final run used loopback network access required by fixtures.
22. **Frontend tests:** 150 passed across 29 files. Includes Welcome/default/actions/all finite snoozes/corruption/local midnight, tutorial state/permissions/zero-one-multiple Trees, grants, compact guide, EN/TH and theme tokens/contrast.
23. **TypeScript:** `npx tsc -b` passed.
24. **Production build:** passed. Existing main-bundle size advisory remains; no new tour dependency added.
25. **Diff check:** `git diff --check` passed.
26. **Docker:** original and disposable PostgreSQL/backend/frontend all healthy; backend health and frontend proxy health both passed. Final frontend image deployed to original stack. Disposable `ats-onboarding-revision` resources cleaned after verification; original volumes retained.
27. **Welcome browser:** real Chrome login, EN/TH introduction, tutorial start, Dashboard continuation and return-on-entry passed. No permanent-dismissal option exists.
28. **Snooze browser:** session survives reload and logout/login; an independent fresh tab shows Welcome. Today equals local midnight; 3/7/14 timestamps and reload suppression passed; safely expired test preferences caused Welcome to return.
29. **Multiple-Tree browser:** two backend-Ready Trees and one draft; Configure, Run and Connect each required picker selection. Selected destinations matched exact Tree IDs. Escape dismissal also passed.
30. **Dark browser:** visually inspected and captured Dashboard, tutorial, Trees, workspace, Providers, Tools, Runs, Connect and Welcome. Clearer shared surface hierarchy; automated normal/muted text contrast checks are ≥4.5 across primary surfaces.
31. **Light browser:** same eight major pages captured and inspected, including Dashboard/workspace; softer background and distinct cards/inputs. Theme state persisted across navigation.
32. **Thai browser:** Welcome/tutorial/picker, contextual Provider help, Dashboard, Providers, Trees, Tools, Runs/Trace and Connect inspected and captured. New guidance updates without reload.
33. **English browser:** switched back live; tutorial and Connect updated correctly. No Thai content in Connect's main area. The selector's native-language option is intentional.
34. **Network/logs:** recorded URL/status only, without credential headers/bodies. The only 4xx responses were expected `/api/auth/me` 401 checks while signed out; no unexplained 4xx/5xx or request loop. Backend/frontend logs from both projects inspected with no 500, traceback or tested credential leak. See [checks](checks.json), [runtime](runtime.json), [network](browser-network.json) and [reload network](reload-network.json).
35. **Screenshots:** actual Chrome captures under `screenshots/`; see [manifest](screenshots.md). Previous verification directories were preserved. Required Welcome EN/TH, tutorial, picker, compact Dashboard, both theme Dashboards/workspaces, Thai help and Connect are included.
36. **Core:** `/home/fluke/Agenttree` git status clean before and after; untouched. Learning, chatbot, A2A and distributed execution untouched. Existing authentication, API Keys, V1/V2, Webhooks and outgoing destinations remain intact.
37. **Limitations:** preferences are per account/browser, not server-synchronized. SessionStorage is tab-scoped and browser session restoration can retain it. Today uses browser timezone. Advanced legacy dialogs still contain some English technical copy; this was a priority-copy revision, not a whole-product localization rewrite. No spotlight tour. Automated contrast checks cover shared normal/muted text surfaces, not a certification of every graph/badge state. Genuine human Thai UX review remains useful.
38. **Next user test:** give the revised Studio to a Thai-speaking first-time user and an English-speaking first-time user without verbal instruction. Observe whether they understand the Agent hierarchy, choose the intended Tree, run it, inspect Trace and find Connect. Ask specifically about Welcome frequency and both themes' comfort.

## Revision file list

- `frontend/src/components/agent-mental-model.tsx` (new)
- `frontend/src/components/welcome-dialog.tsx` (new)
- `frontend/src/components/welcome-dialog.test.tsx` (new)
- `frontend/src/components/language-select.tsx` (new)
- `frontend/src/components/app-layout.tsx`
- `frontend/src/components/getting-started.tsx`
- `frontend/src/components/getting-started.test.tsx`
- `frontend/src/components/sidebar.tsx`
- `frontend/src/components/theme-toggle.tsx`
- `frontend/src/components/theme-toggle.test.tsx` (new)
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/select.tsx`
- `frontend/src/components/ui/textarea.tsx`
- `frontend/src/components/tree/api-examples.tsx`
- `frontend/src/components/tree/connect-tab.tsx`
- `frontend/src/lib/welcome.ts` (new)
- `frontend/src/lib/onboarding.ts`
- `frontend/src/pages/getting-started.tsx`
- `frontend/src/pages/dashboard.tsx`
- `frontend/src/pages/limited-dashboard.tsx`
- `frontend/src/index.css`
- `frontend/src/i18n.ts`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/th/translation.json`
- `README.md`
- `docs/getting-started.md`
- `docs/verification-onboarding-revision/` (new evidence)

## Real execution evidence

Real Provider: Gemini, verified model `models/gemini-3.1-flash-lite`. No mocked generation. Final Run `ecb3c72c-69c5-4ff6-a716-4cf48153db7f` completed through `studio_live`, with successful persisted result, usage and 24 trace events. Run/Trace and six-step progress survived actual reload. See [journey](journey.json) and [persisted trace screenshot](screenshots/18-persisted-run-trace.png). Disposable Run data was removed only after evidence capture and verification.
