# Visual identity review

## Before

See actual Chrome captures in [before/](before/). The previous revision improved readability but kept broad blue-gray fields: Light used `#E8EDF4` behind `#F5F8FC` cards and a dark navy sidebar; Dark used `#18243A` behind `#22314B` cards. Across Dashboard, forms and workspace, the same navy family occupied nearly every large area. Dashboard used long rules between sections and a flat metric strip; node roles shared the same visual treatment. Indigo/violet, cyan, warning and error classes were not consistently connected to semantic tokens.

## Direction

Indigo establishes the brand through actions, selected navigation, focus and progress. Cyan is a secondary cue for activity and Managers. Neutral working surfaces keep code, forms and monitoring legible. Emerald, amber and rose retain their meanings and do not compete with role colors.

Light and Dark now share the same identity, including the sidebar. Light uses near-neutral application space and clean white working content. Dark uses charcoal-violet layers, with lavender interaction accents. There are no new decorative gradients, glow effects, font downloads or design-system dependencies.

## Final palette

| Token / purpose | Light | Dark |
|---|---|---|
| Application background | `#F7F8FC` | `#151723` |
| Working surface / card | `#FFFFFF` | `#232638` |
| Secondary surface | `#EFF1F8` | `#2B3043` |
| Elevated dialog | `#FDFDFF` | `#30354B` |
| Input | `#FAFAFD` | `#1A1D2C` |
| Foreground | `#1C2033` | `#F1F2FA` |
| Secondary foreground | `#454C63` | `#CED2E3` |
| Muted foreground | `#616779` | `#B5BED3` |
| Border | `#DFE3EE` | `#3D445D` |
| Strong border | `#A3ABC0` | `#657089` |
| Primary | `#5D4AE8` | `#A59BFF` |
| Primary hover | `#503CD3` | `#B9B1FF` |
| Primary active | `#4330BD` | `#9385FF` |
| Primary foreground | `#FFFFFF` | `#201A44` |
| Cyan / information | `#087B9A` | `#58C8E8` |
| Success | `#087B55` | `#64D9AC` |
| Warning | `#956018` | `#F2C16B` |
| Danger text | `#C63C55` | `#FB8FA5` |
| Sidebar | `#F0F1F9` | `#1B1D2D` |
| Selected sidebar | `#E5E0FE` | `#343052` |

Semantic subtle fills have dedicated tokens rather than depending on arbitrary per-component opacity. Existing `card`, `secondary`, `elevated`, `destructive` and `ring` names remain compatible with the component library; `surface`, `surface-secondary`, `surface-elevated`, `danger` and `focus-ring` are aliases in the same system. The existing `accent` utility remains a subtle selection fill; `info` supplies the cyan secondary hue. This avoids two competing token systems.

## Iteration and hierarchy

The first iteration is retained in [iteration-1/](iteration-1/). After reviewing it in Chrome, Dark background/cards were raised from `#11121B`/`#1B1E2B` to `#151723`/`#232638`; secondary, elevated, input and border levels moved with them. This keeps the palette crisp without restoring broad navy surfaces. Dashboard panels now align to their content rather than stretching a short recent-Run panel to the Quick Actions height.

- **Sidebar:** matching Light/Dark surfaces, token-based logo enclosure, restrained indigo left selection cue and quieter section tracking. No luminous active button.
- **Dashboard:** one contained metric strip and a few purposeful operational groups. Lists inside groups remain rows, rather than nested floating cards. Compact tutorial card stays compact.
- **Welcome:** larger introduction title, elevated dialog and shared role-cued mental model. Snooze semantics are unchanged.
- **Tutorial:** numbered chips, green completed states, an indigo current-step border and muted future-step chips. Backend facts and acknowledgements are unchanged.
- **Tree Workspace:** dotted neutral canvas, root-indigo / manager-cyan / specialist-neutral node edges, restrained shadow and explicit selected fill/ring. Green readiness and amber setup badges remain distinct from role cues.
- **Forms:** input surface, strong hover border, indigo focus and semantic invalid styles. Login now applies the saved theme before authentication and reuses existing language/theme controls.
- **Run/Trace:** neutral event bodies and shared semantic colors. Raw payloads and event names remain technical data; they are not translated or recolored as decoration.

A final browser review caught Tailwind border utilities overriding the node role edges. The edges and selected fill now use explicit token-based utilities, so Root/Manager/Specialist cues survive the cascade in both the tutorial and workspace.

## Terminology

Technical nouns name concepts; natural Thai explains actions and behavior. Dashboard, Getting Started, Templates, Tree, Agent, Provider, Model, Tool, Run, Execution Trace, Live View, Connect, API Key and Webhook remain recognizable. Legacy transliterations and literal names were replaced throughout active resource copy. Previously hardcoded form and dialog descriptions now use the existing i18next resources and update live.

See [language style guide](../ui-language-style-guide.md). Existing Learning roadmap content was left untouched; no Learning behavior was added. User names, provider model IDs, protocol fields and runtime payloads retain their original content.

## Quality gate

Reviewed final screenshots as a set, including Dashboard, Welcome, tutorial, workspace, forms and monitoring in both modes. The useful comparison is specific: sidebar and working area now belong to the same mode; indigo consistently identifies interaction; white Light content and layered Dark content establish hierarchy; cyan role/activity cues and semantic statuses are distinguishable. This is a visual design judgment, not a claim that passing contrast tests proves a universal aesthetic preference. Human long-session and Thai UX feedback remains the next evaluation.
