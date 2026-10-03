# Motion verification

Verification uses real Chrome pointer input and browser animation frames, not DOM snapshots alone.

| Interaction | Implementation and verification |
| --- | --- |
| Palette drag | Browser-native HTML drag image; CDP intercepts real palette DragData and delivers actual drag/drop. Active drop border captured in screenshot 03. |
| Insert | 180 ms fade/scale; new Manager appears in canonical document, with Root still unique. |
| Connection | Pointer drag between actual handles; valid edge receives a one-shot 500 ms accent pulse. Idle edges do not animate. |
| Rejection | Invalid preview uses danger token; concise rejection feedback has a 180 ms restrained horizontal motion. Edge count and stored hierarchy remain unchanged. |
| Selection | Border/surface/shadow transition, without continuous glow. Shift-click retains group selection rather than opening configuration. |
| Auto Layout | 360 ms eased position interpolation, then 320 ms Fit. Browser samples show multiple intermediate node positions; see browser-acceptance.json. |
| Collapse | Hide descendants without deleting configuration; hidden Agent count remains visible. Collapse is an immediate visibility change, without a subtree travel animation. |
| Drawer | 220 ms entry motion; actual right-side drawer is visible and scrollable. Configure button also works with keyboard Enter. |
| Reduced motion | CSS disables nonessential transitions/animations; JS skips layout interpolation and animated Fit. Browser emulation verifies insertion animation is none. |

Screenshots show resulting states; native-drag.json and browser-acceptance.json provide interaction/network evidence. No execution activity is fabricated.
