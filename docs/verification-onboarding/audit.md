# Audit before implementation

- Studio HEAD: `4086b80`; the previous External Integration implementation is present as uncommitted work and was preserved. Core worktree was clean.
- Dashboard distinguishes admin and limited accounts, but offers scattered quick actions rather than a first-use sequence. Empty states explain some resources but lack direct actions.
- Existing Templates instantiate a draft and route to Template Setup. Setup and the Visual Workspace already explain Agent roles. Blank Tree remains a manual wizard.
- Provider usability already means connected plus an available, generation-candidate, qualified model. Readiness is backend-authoritative on the Tree and current version.
- Live View submits to the existing asynchronous Studio Run API. Runs, results and Execution Trace are persisted. Connect already contains recommended async and secondary sync examples, API Key links, webhook ingress and outgoing destinations.
- Studio permissions separately control Provider management, Tree management, Tree use, and execution viewing. Granted Trees come from AuthService.my_trees. Tree configuration routes require management; use-only accounts use Account → Tree Access.
- Existing dashboard summaries truncate recent Runs; they cannot reliably indicate a prior successful personal Run. The existing authenticated Dashboard response can supply permission-filtered facts without new storage.
- Existing browser preferences use localStorage for theme/language. Only panel collapse and Ready Connect visits need new account-namespaced UI preferences.
- No tour dependency exists. A responsive, accessible checklist, persistent Help entry and contextual help are the selected minimal onboarding. The optional navigation spotlight tour is deferred.
