# Visual Builder UX revision — real browser screenshots

These are Chrome captures from the local Docker-hosted Studio. Viewport was 1440×900 unless noted. Images containing the unconnected dark/Thai draft are identified below; no mock states were generated.

| Screenshot | Captured state |
|---|---|
| [01-create-tree-selector.png](screenshots/01-create-tree-selector.png) | Light, English method selector; Visual Builder, Guided Wizard, Templates shortcut |
| [02-create-tree-selector-thai.png](screenshots/02-create-tree-selector-thai.png) | Light, Thai method selector with technical terms retained in English |
| [04-visual-builder-creation.png](screenshots/04-visual-builder-creation.png) | Empty Visual Builder and Root-first guidance |
| [05-dashboard-create-tree-entry.png](screenshots/05-dashboard-create-tree-entry.png) | Dashboard Create Tree entry point |
| [05-guided-wizard.png](screenshots/05-guided-wizard.png) | Existing six-step Guided Wizard, first step |
| [06-wizard-created-tree-in-builder.png](screenshots/06-wizard-created-tree-in-builder.png) | Draft saved through Guided Wizard, then opened in Visual Builder |
| [09-specialist-inspector.png](screenshots/09-specialist-inspector.png) | Specialist selected; parent, status, capabilities, Provider/Model, and edit action |
| [11-root-manager-connection.png](screenshots/11-root-manager-connection.png) | Light, English; valid hierarchy and two Agents attached to one MCP node; MCP Inspector open |
| [14-invalid-connection.png](screenshots/14-invalid-connection.png) | Invalid Root→Specialist drag rejected with inline message |
| [16-shared-resource-bindings.png](screenshots/16-shared-resource-bindings.png) | One shared MCP node with two assignment edges; safe resource Inspector |
| [17-tools-hidden.png](screenshots/17-tools-hidden.png) | MCP visual filter hides its graph node; binding retention was verified in the live browser state separately |
| [21-maximum-canvas.png](screenshots/21-maximum-canvas.png) | Components and Inspector collapsed to maximize Canvas |
| [22-focus-canvas.png](screenshots/22-focus-canvas.png) | Reversible application-level Focus Canvas mode |
| [27-dark-builder.png](screenshots/27-dark-builder.png) | Dark Builder visual review; real unconnected draft state |
| [28-thai-builder.png](screenshots/28-thai-builder.png) | Thai Builder copy and terminology review; real unconnected draft state |
| [29-english-builder.png](screenshots/29-english-builder.png) | English Builder copy review |
| [30-builder-persisted.png](screenshots/30-builder-persisted.png) | Builder-created disposable Tree after save/reload, with shared MCP binding |
| [32-advanced-editor-consistency.png](screenshots/32-advanced-editor-consistency.png) | Same saved Tree opened in Guided Wizard Tools step; both Basic Tool assignments checked |
| [33-playground-navigation.png](screenshots/33-playground-navigation.png) | Same Tree opened in Playground; backend readiness gate and live graph shown |

The full real interaction sequence and status details are in [report.md](report.md). Disposable Tree/user records were removed after capture; the application/database itself was not reset.

## Authenticated Chrome closure — 2026-10-02

The account holder authenticated the existing Admin session and the remaining browser flows were exercised in the actual Docker-hosted Studio. The Chrome screenshots were inspected live during the flow, but this continuation's browser-control surface did not expose a file-export path for saving those new captures. No synthetic screenshots were created.

Live states visually inspected:

| Live state | Verification |
|---|---|
| General Analysis Template → Tree → Builder | The same six-Agent hierarchy appeared after template instantiation and in Builder. |
| Shared non-MCP `Artifact Output` Tool | One resource node connected to Research Manager and Synthesis Manager; Inspector showed both users; save/reload and Advanced Editor retained both assignments. |
| 25-Agent scale graph | 1 Root, 4 Managers, 20 Specialists, 24 hierarchy edges; four existing Tool/MCP resources appeared once each. A fifth resource was not created. |
| Dark + Thai connected graph | The connected Template graph was viewed in Playground using Thai and Dark theme; technical vocabulary remained English within natural Thai guidance. |
| Light + English regression | The Builder graph and copy were viewed after switching back to Light and English. |
| Existing `Blank Tree` | The original Tree opened in Builder with one Root and Root creation disabled; it was not edited. Its timestamp does not prove pre-revision provenance. |
| Create Tree / Wizard | Selector displayed both methods and Templates; existing six-step Wizard completed a disposable Tree and that Tree opened in Builder. |
| Playground route | Builder opened the same Tree's Playground; no Run was started. |
| Final cleanup | Trees list showed only original `Blank Tree` after the three disposable Trees were deleted. |
| Post-cleanup Dashboard | Overview showed 1 Tree, 3 Providers, 4 Tools, and 2 Studio accounts. |

These live observations do not add new PNG files to the table above. In particular, `27-dark-builder.png` and `28-thai-builder.png` remain the earlier unconnected draft captures and must not be treated as screenshots of the connected Dark/Thai graph. The visible final cleanup toast is also not persisted as a screenshot. The [report](report.md) records remaining evidence gaps, including direct Network panel access and the restricted-user login check.

## Final handle-warning closure — 2026-10-02

The real browser was used to reproduce the read-only shared-resource graph after the React Flow handle fix. Live states verified:

| Live state | Verification |
|---|---|
| Shared non-MCP Tool in Builder | One `Artifact Output` node connected to Manager and Specialist; two attachment edges. |
| Tool hidden / restored | Visual node and edges disappeared/restored together; Agent Tool counts remained. |
| Tool Inspector | Status, assigned Agent names, and safe description rendered; no Secret or credential fields. |
| Agent Inspector | Manager details reflected the persisted parent, child, and Tool binding. |
| Layout and reload | Auto Layout, Fit View, save/reload retained the same three-Agent hierarchy and two Tool bindings. |
| Read-only Playground | The persisted shared Tool appeared once with both attachment edges in the observation graph. |
| Cleanup | The disposable Tree was deleted; Trees and Dashboard returned to the original one Tree, three Providers, four Tools, and two accounts. |

The in-app browser-control surface cannot export these live captures as PNGs or expose DevTools console output. The screenshot table above remains unchanged; no images were fabricated. The code-level root cause and its fix are documented in [report.md](report.md). The remaining restricted-user authorization check was not performed because no test-account credential was available and none was changed.

## Restricted-user authorization continuation — 2026-10-02

The account holder authenticated the in-app browser as disposable restricted user `test` (role `User`). The current browser surface showed these real states, but it did not provide a filesystem export for saving new PNG screenshots:

| Live state | Verification |
|---|---|
| Account → Tree Access | UI stated the account cannot use Trees and has no Tree grants. |
| Direct Builder URL after hard reload | Original `Blank Tree` rendered with its Root, readiness issues, and Builder controls. The existing Agent editor opened and was closed without saving. |
| Root Inspector and Agent editor | Displayed only safe Agent/configuration summaries and Provider names; no Secret values, API keys, credentials, headers, or encrypted material appeared. |
| Direct `/tools` route | Rendered `Access Denied`; no Tool/MCP edits or bindings were attempted. |
| Direct backend API URL | The browser blocked navigation to `/api/trees/{id}` before a response was visible. No backend HTTP denial status is claimed. |
| Cleanup / preservation | No Tree, Tool/MCP, or grant was created; original `Blank Tree` was not saved or altered. The provided `test` account remains because it is the active identity and no Admin session was available for deletion. |

No new screenshot files were added for these states because the browser-control surface did not expose a capture-to-file path. The previous screenshot inventory above remains unchanged. The live observations, exact limitations, Docker/migration state, and clean Core status are recorded in [report.md](report.md). DevTools console access remains unavailable as accepted by the user; the outstanding authorization gap is the missing Admin-created selected Tree-use grant plus an actual backend deny response for an ungranted Tree/Tool operation.


## Autonomous authorization closure — 2026-10-02

These seven newly saved real JPEGs supersede earlier export limitations. No password-entry screen was captured. All task-created resources were deleted afterward.

| Capture | Evidence |
|---|---|
| [01-selected-grant-dashboard.jpg](authorization/01-selected-grant-dashboard.jpg) | Use-only restricted identity; only allowed Tree listed. |
| [02-use-only-builder-denied.jpg](authorization/02-use-only-builder-denied.jpg) | Direct ungranted Builder navigation denied without management permission. |
| [03-manager-inspector-safe.jpg](authorization/03-manager-inspector-safe.jpg) | Safe allowed Root Inspector under restricted global management. |
| [04-builder-edit-persisted.jpg](authorization/04-builder-edit-persisted.jpg) | Disposable Root edit visible after reload. |
| [05-global-manager-ungranted-builder.jpg](authorization/05-global-manager-ungranted-builder.jpg) | Global manager can open ungranted Builder: evidence of the requested-policy mismatch, not a denial claim. |
| [06-tools-access-denied.jpg](authorization/06-tools-access-denied.jpg) | Direct Tool management route denied; API list/detail/write independently returned 403. |
| [07-cleanup-session-invalidated.jpg](authorization/07-cleanup-session-invalidated.jpg) | Deleted identity returned to Sign In on reload. |

Live HTTP matrix, console results, cleanup, original-record comparison and exact remaining scoped-Builder limitation are in [report.md](report.md). Screenshots alone are not backend authorization evidence.

## Tree-scoped RBAC correction — real browser evidence

These captures supersede the prior global-management limitation; all depicted test resources were removed afterward.

| File | Verified state |
|---|---|
| [01-scoped-tree-list.jpg](tree-scoped-rbac/01-scoped-tree-list.jpg) | Only explicitly granted Tree listed |
| [02-safe-inspector.jpg](tree-scoped-rbac/02-safe-inspector.jpg) | Safe restricted Agent Inspector |
| [03-edit-persisted.jpg](tree-scoped-rbac/03-edit-persisted.jpg) | Permitted edit persisted after reload |
| [04-denied-builder.jpg](tree-scoped-rbac/04-denied-builder.jpg) | Direct ungranted Builder URL rejected |
| [05-resource-access-denied.jpg](tree-scoped-rbac/05-resource-access-denied.jpg) | Resource-management route denied |
| [06-grants-revoked.jpg](tree-scoped-rbac/06-grants-revoked.jpg) | Immediate grant revocation removes Tree listing |
| [07-cleanup-session-invalidated.jpg](tree-scoped-rbac/07-cleanup-session-invalidated.jpg) | Deleted disposable identity returned to Sign In |
