# Audit before implementation

Studio HEAD `4086b80`; prior integration/onboarding work is uncommitted and retained. Inspected git status/log10 and previous report/screenshots. Core status clean. Read current global theme/Tailwind mapping, primitives, sidebar, auth shell, Dashboard, tutorial, Tree canvases, forms, status badges, Providers, Tools, Secrets, Templates, Run/Trace/Connect and localization resources.

Real Chrome before-captures are in `before/`, using a disposable Docker project and a verified Gemini connection. The current palette was viewed before edits. It uses broad blue-gray working surfaces, similar-chroma sidebar/cards, uniform node cards and line-separated Dashboard sections. Shared elevation tokens exist but their colors retain the same mood. Hardcoded red/amber/emerald/blue/violet classes bypass semantic colors in several forms and traces; logo/sidebar motifs bypass brand tokens.

Existing i18next is retained. Thai terminology mixes English with transliterations and legacy translations: Template/เทมเพลต, Model/โมเดล, Dashboard/แดชบอร์ด, Run/รัน, Live View/มุมมองสด. Some dialogs and configuration forms still use hardcoded English prose. Technical backend event names, provider model names and user data should remain untouched.

Direction: indigo interaction/selection, cyan secondary and Manager cue, neutral cool surfaces, emerald/amber/rose semantic states. Light sidebar should belong to Light; Dark uses charcoal-violet layers rather than navy. Improve grouping, role cues, progress and form states through shared primitives. Preserve all onboarding/state/auth/runtime behavior. No backend or migration planned.
