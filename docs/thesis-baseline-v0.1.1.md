# AgentTree Thesis Baseline v0.1.1 — UI polish

## Revision identity

| Repository | Revision | Exact commit | Version |
| --- | --- | --- | --- |
| Studio | `thesis-baseline-v0.1.1` | `$Format:%H$` | Application `0.1.0` |
| Studio historical baseline | `thesis-baseline-v0.1` | `6438d29e96c8fdff577bc5858e5c23ca090705a2` | Application `0.1.0` |
| Core frozen runtime | `thesis-baseline-v0.1` | `f01856b99a079c01e00c60988d3657819c95a188` | Package `0.2.2` alpha |

Studio `main` receives scoped Dashboard/Secrets/Users/Settings presentation polish and Thai documentation. Core `main` receives **README.md only** after its frozen runtime tag. Core has no v0.1.1 tag. Both historical annotated v0.1 tags are immutable.

There are no intended changes to Core runtime, orchestration, Studio backend, API behavior, authentication/authorization, database schema or migrations. Builder, Wizard, Playground, Executions, Templates and Connect retain their existing contracts. No case study starts in this revision.

## Exact-SHA strategy

A commit cannot store its own literal resulting hash: changing that field changes the commit again. This manifest uses the same deterministic Git `export-subst` strategy as v0.1. The field above is expanded to the exact tagged commit by `git archive`; in a normal checkout it intentionally remains a substitution field, **not a pre-manifest SHA**.

```bash
git rev-parse 'thesis-baseline-v0.1.1^{commit}'
git archive thesis-baseline-v0.1.1 docs/thesis-baseline-v0.1.1.md |
  tar -xO docs/thesis-baseline-v0.1.1.md
```

The annotated v0.1.1 tag carries the actual full Studio SHA and Core frozen SHA. Post-commit publication proof is recorded separately in local `docs/verification-post-freeze-ui-polish/publication-receipt.json`, deliberately ignored to avoid changing the identity it proves. Remote branch/tag refs are the public authoritative identity; tag creation/publication must be verified rather than inferred from this document's existence.

## Verification

See [acceptance report](verification-post-freeze-ui-polish/report.md) and [real screenshots](verification-post-freeze-ui-polish/screenshots.md). Studio: 314 frontend tests and 309 backend tests passed, TypeScript and production build passed. Docker was rebuilt with existing volumes; PostgreSQL/backend/frontend are healthy and migrations remain at `0013_run_cancellation_status`. Original resource counts and ID sets are unchanged.

Read-only Chromium acceptance covered both themes/locales, default desktop, 1440×900 desktop and 760×900 narrow viewport, safe admin interactions and short unchanged-product regressions. No paid Provider Run was needed. Core README's offline example completed with 21 Trace events; this is not a new Core runtime certification. Historical Core verification remains 729 passed / five existing skips.

## Publication

Repositories:

- [Studio](https://github.com/FlukeNoppanan/agenttree-studio): `main`, historical v0.1 and new annotated v0.1.1
- [Core](https://github.com/FlukeNoppanan/Agenttree): `main` and historical annotated v0.1 only

Only normal pushes are permitted. Remote tags must match their local targets and both default branches must contain the Thai README. Conflicting refs or divergent history block publication; no force update is allowed.

Next planned work: **Case Study 1 — Wazuh → AgentTree → Discord**, followed by Network Configuration and Software Development. None is implemented by this revision.
