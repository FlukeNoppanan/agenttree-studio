# AgentTree thesis baseline v0.1.3

| Identity | Exact revision |
| --- | --- |
| Studio tag | `thesis-baseline-v0.1.3` (annotated after acceptance) |
| Studio commit | `$Format:%H$` |
| Studio application version | 0.1.0 (unchanged) |
| Previous Studio v0.1.2 | `3ff7af00d0bbcd6da1f624964d020bc16661b825` |
| Historical Studio v0.1.1 | `8cad7bd38a6f2381520dd6c44cefef1afb456d20` |
| Historical Studio v0.1 | `6438d29e96c8fdff577bc5858e5c23ca090705a2` |
| Frozen Core runtime | `f01856b99a079c01e00c60988d3657819c95a188` |
| Core main | `a1315a4f3d9498005522fd233c4e4cd6f849b0d7` — unchanged |

Studio consolidation: authoritative current-version resource guards, safe deleted-resource identities preserving historical versions/Executions/results/Trace/Artifacts, additive migration `0014_resource_history`, 16 portable Templates (5 Beginner / 7 Intermediate / 4 Advanced), nine honest catalog entries with MCP scope/registration guidance, and a structurally redesigned bilingual Dashboard using existing operational data and shared cool-neutral/blue tokens. No new dependencies or Core/runtime/authentication/Public API version changes.

Acceptance: **345 backend / 340 frontend** tests, TypeScript/build/diff checks passed. Real Docker services healthy and PostgreSQL at migration head. Authenticated Chromium verified historical Provider deletion without deleting Trees, current Provider protection, Secret rotation, Template import/configuration/Ready/save/reload/real Run/Trace, Wizard/Builder/Connect/onboarding regression, Dashboard before/after iteration, populated/minimal states, both themes/locales and responsive widths. Independent authenticated HTTP verified current DELETE 409, Tree grants/denials, Public V1/V2 reads and exact durable SSE replay.

Real qualified Gemini Beginner/Intermediate/Advanced executions completed. Advanced Run `2250752c-3aee-47c1-b17c-6b4b13540c86` persisted 130 Trace rows and one Artifact with Manager Review and Root Final Review. Accepted Intermediate completed Root-direct; an earlier partial delegated attempt and model factual-quality limitation are explicitly documented. No fake delegation or guarantee of output quality.

Original database volume and every original resource ID retained; disposable Trees/Providers/Tools/Secrets/users/API Key/owned files removed after collecting evidence. Original Blank Tree remains draft with its original current version. Historical tags remain immutable; Core remains clean and frozen.

See [verification report](verification-thesis-baseline-v0.1.3/report.md), [screenshots](verification-thesis-baseline-v0.1.3/screenshots.md), [visual review](verification-thesis-baseline-v0.1.3/visual-review.md), and [Template/Tool catalog guide](template-tool-catalog.md).

The commit cannot contain its own resulting literal SHA. As previous baselines, `export-subst` expands the field above in `git archive thesis-baseline-v0.1.3`. The annotated tag and ignored local `verification-thesis-baseline-v0.1.3/publication-receipt.json` carry exact publication proof after normal branch/tag push and independent remote verification. No force push or Core publication is authorized by this baseline.
