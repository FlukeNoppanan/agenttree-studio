# Files changed in the onboarding phase

The earlier External Integration work remains uncommitted and was preserved. This list identifies the onboarding phase's source/document changes, including files shared with that earlier work.

## Backend

- `backend/api/dashboard.py` — derive permission-filtered setup facts from existing models.
- `backend/schemas/dashboard.py` — additive Dashboard response schemas.
- `tests/test_onboarding.py` — six state/access regression tests.

## Frontend

- `frontend/src/components/getting-started.tsx` and `.test.tsx` — checklist, navigation, state refresh, collapse and tests.
- `frontend/src/components/concept-help.tsx` — existing Dialog primitive for concise contextual explanations.
- `frontend/src/lib/onboarding.ts` — account-specific, credential-free browser preferences.
- `frontend/src/pages/getting-started.tsx` — reopenable guide and terminology.
- `frontend/src/components/empty-state.tsx` — optional action slot.
- `frontend/src/components/sidebar.tsx`, `frontend/src/router.tsx`, `frontend/src/pages/dashboard.tsx` — Help route, prominent/compact Dashboard guide and direct Connect link.
- `frontend/src/pages/providers.tsx`, `.test.tsx` — useful empty action, permission-aware Secret guidance/reads.
- `frontend/src/pages/trees/tree-list.tsx` — Template and Blank Tree empty actions.
- `frontend/src/pages/templates.tsx`, `frontend/src/components/tree/tree-wizard.tsx` — recommended Template/manual Blank guidance and optional Tool explanation.
- `frontend/src/pages/tools.tsx`, `frontend/src/pages/runs/run-list.tsx` — beginner explanations and useful existing routes.
- `frontend/src/components/tree/provider-model-selector.tsx`, `frontend/src/components/tree/capability-selector.tsx` — contextual help.
- `frontend/src/components/tree/connect-tab.tsx`, `.test.tsx` — Ready Connect acknowledgement and permission regression.
- `frontend/src/pages/trees/tree-detail.tsx` — avoid forbidden resource reads; hide execution navigation when unavailable.
- `frontend/src/lib/api.ts` — additive setup fact types.
- `frontend/src/locales/en/translation.json`, `frontend/src/locales/th/translation.json` — localized guide, terminology and empty states; existing compact formatting retained.
- `frontend/src/pages/onboarding-empty-states.test.tsx` — four actionable empty-state tests.

## Documentation and evidence

- `README.md`, `docs/getting-started.md`.
- `docs/verification-onboarding/audit.md`, `report.md`, `files.md`.
- `docs/verification-onboarding/journey.json`, `runtime.json`, two browser network records, two sanitized HTTP logs and fourteen real screenshots.

No onboarding migration, Core changes or Learning changes were made.
