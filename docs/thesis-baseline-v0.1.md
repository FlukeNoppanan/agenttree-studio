# AgentTree Thesis Baseline v0.1

## Purpose

This is the frozen generic platform baseline shared by all three thesis case studies. Studio and Core remain separate repositories. Case-study results must identify both revisions below, their configuration, and the relevant real Run IDs. This checkpoint adds no platform feature and does not start a case study.

## Freeze date

2026-10-03T17:30:41+07:00 (Asia/Bangkok), final validation checkpoint. The annotated tags and post-freeze receipt record the exact commit/tag completion timestamps.

## Repositories and exact revision identity

| Repository | Branch at freeze | Exact revision | Application/package version |
| --- | --- | --- | --- |
| [AgentTree Studio](https://github.com/FlukeNoppanan/agenttree-studio) | `main` | `$Format:%H$` | Studio `0.1.0` |
| [AgentTree Core](https://github.com/FlukeNoppanan/Agenttree) | `main` | `f01856b99a079c01e00c60988d3657819c95a188` | Core `0.2.2` alpha |

Both repositories use the local annotated tag **`thesis-baseline-v0.1`**. The Studio revision above is a Git `export-subst` field: `git archive` substitutes the exact commit containing this manifest. In a normal checkout, resolve the immutable reference with `git rev-parse 'thesis-baseline-v0.1^{commit}'`. Do not mistake the literal substitution field for a SHA. A commit cannot embed its own resulting hash without changing that hash; an extra correction commit cannot solve that recursion. This manifest uses Git's deterministic revision substitution instead of recording an incorrect pre-manifest SHA.

The annotated tag messages and the post-freeze local `docs/verification-thesis-baseline-v0.1/freeze-receipt.json` record both literal full commit SHAs. The receipt is deliberately excluded from the commit it identifies; the tag is the versioned source of truth. No tag may be moved or overwritten.

Inspect the canonical manifest with its actual Studio SHA:

```bash
git -C Agenttree-Studio archive thesis-baseline-v0.1 docs/thesis-baseline-v0.1.md |
  tar -xO docs/thesis-baseline-v0.1.md
git -C Agenttree-Studio rev-parse 'thesis-baseline-v0.1^{commit}'
git -C Agenttree rev-parse 'thesis-baseline-v0.1^{commit}'
```

Thesis Baseline **v0.1** is an evaluation label; the application/package versions remain unchanged. This local freeze does not publish packages, images, GitHub releases, commits or tags remotely.

## Product flow

**BUILD → CONFIGURE → RUN → OBSERVE → CONNECT**

- Create Tree directly selects Visual Builder or the existing Guided Wizard.
- Use Template opens its canonical hierarchy in an unsaved Visual Builder. Save creates an ordinary Tree with its source metadata and requirements.
- Backend readiness governs execution. Playground tests independent inputs against the real Tree and existing Run infrastructure.
- Executions contains the history, results, timeline, artifacts and full persisted Execution Trace. Legacy Run/Trace links remain compatible.
- Connect exposes existing Public API V2, synchronous V1 and authenticated incoming Webhook integration; outgoing Result Destinations remain separate.

## Architecture

```text
Root
  └─ Manager(s)
       └─ Specialist(s)
            └─ assigned Tool / MCP resources

Orchestration Engine: runtime/controller for this hierarchy, not another Agent.
```

Exactly one Root coordinates the Tree. Managers decompose, delegate and review; Specialists perform capability-specific work. Provider/Model bindings are Agent configuration, not graph execution nodes. Tools/MCP are reusable resources, not Agents; shared visual nodes do not merge independent authorization/bindings. Existing supported Tool bindings on other roles remain supported. Core owns execution semantics; Studio owns product configuration, permissions, persistence and integration.

## Verified capabilities and certification

The following summary refers to actual recorded acceptance, not a new certification claim:

- Root/Manager/Specialist execution, capability routing, Manager review/revision and Root synthesis.
- Strict structured decisions, one bounded repair, observed real repair evidence and safe failure classification.
- Provider discovery/qualification, unusable-model filtering and retained saved unavailable bindings.
- Tool and MCP execution; ordinary Tool argument bounds remain 16 KiB by default.
- Separately bounded built-in Artifact Output; recorded real Gemini output of 39,342 UTF-8 bytes.
- Real SSE/live graph events, persisted Run/results/events/Trace/artifacts, cancellation and completed-Run recovery.
- Public API V1/V2, authenticated ingress, existing Result Destinations and API-key lifecycle/current permissions.
- Visual Builder direct hierarchy/resource manipulation, shared resources, Inspector, history, layout, Wizard compatibility, onboarding and EN/TH + Light/Dark UX.

Authorities:

- [Runtime closure](verification-playground-runtime-closure/report.md), especially the final Provider qualification/reliability closure superseding earlier partial sections; [runtime screenshot index](verification-playground-runtime-closure/screenshots.md).
- [Final Integration Polish](verification-final-integration-polish/report.md) and [screenshots](verification-final-integration-polish/screenshots.md).
- [Final UX Consolidation](verification-final-ux-consolidation/report.md) and [screenshots](verification-final-ux-consolidation/screenshots.md).
- [Freeze validation report](verification-thesis-baseline-v0.1/report.md).

Historical reports retain their original chronology. Earlier partial findings must be read with their later closure, not silently treated as the final status.

## Current test baseline

| Check | Final source validation |
| --- | --- |
| Studio backend | **309 passed**, one existing Starlette cookie deprecation warning |
| Studio frontend | **310 passed**, 46 files |
| Core | **729 passed, five existing optional-dependency skips** |
| TypeScript | Passed `tsc -b` |
| Production frontend | Passed; existing >500 kB chunk advisory |
| Diff checks | Source and final staged baseline must pass |

Core tests must use this checkout: `PYTHONPATH=src .venv/bin/python -m pytest`. The existing Core virtual environment initially imported an older installed wheel; explicit source selection resolved the environment mismatch without a runtime/source change. Studio's local development requirements already install the sibling Core checkout.

## Reproduction

Place the repositories side by side as `Agenttree/` and `Agenttree-Studio/`. Check out the two exact tag commits, using detached worktrees or separate checkouts if preserving local work. These tags are local until a separately authorized publication or bundle transfer.

```bash
git -C Agenttree switch --detach 'thesis-baseline-v0.1^{commit}'
git -C Agenttree-Studio switch --detach 'thesis-baseline-v0.1^{commit}'

# Run from Agenttree-Studio; the additional build context is ../Agenttree.
docker compose up -d --build
docker compose ps
docker compose exec -T backend alembic current
docker compose exec -T backend alembic heads
```

Local Python development: create environments, install Core `.[dev,providers,mcp]` and Studio `requirements.txt`, then select the Core source explicitly when testing it. Frontend uses `npm ci`, `npm test`, `npx tsc -b` and `npm run build`; `package-lock.json` is versioned. Python dependency ranges and Docker base image tags are not a hermetic supply-chain lock. Recorded installed versions and image IDs are in the freeze checks; future SDK/image changes require comparison before claiming an identical environment.

Provision credentials separately. `.env`, database files, encryption keys, cookies/browser state, Docker volumes, caches, build output and real Provider/API/Webhook secrets are not baseline source. Preserve the existing PostgreSQL/artifact/key volumes; do not reset or destructively reseed them. Restoring a source checkout alone does not restore private application data or external Provider quotas.

## Docker and database baseline

PostgreSQL, backend and frontend were healthy in the actual rebuilt Compose environment. The current frontend Compose service retains its existing Vite development-server architecture; a production bundle was separately verified. No deployment redesign occurred.

Migration head: **`0013_run_cancellation_status`**. No new migration was introduced for freezing.

Preserved starting data: 3 Users, 2 Trees, 4 Providers, 4 Tools, 3 Secrets, 7 API tokens, 23 Runs, 10 Tree versions, 1,906 persisted Trace events and 15 Artifact metadata records. Freeze verification compares high-level counts and sorted ID-set hashes, without exporting sensitive records or credentials.

## Known limitations

- Learning remains Coming Soon; A2A and distributed execution are not implemented.
- No automatic Provider fallback or conversation-memory subsystem was added.
- Provider availability, quotas, rate limits and model behavior remain external dependencies; qualification is not a suitability guarantee for every task.
- Active execution is process local. A browser can reattach; backend restart does not resume interrupted Core work. Completed results/Trace/artifacts persist.
- Canvas layout preferences remain browser local; desktop is the primary graph-editing target.
- Five existing Core tests require optional SDK/backend dependencies absent from that test environment; no new skip was introduced.
- Existing chunk-size/deprecation advisories are disclosed. This freeze does not claim exhaustive live coverage of every supported Provider or a fresh runtime certification.
- Source identities are exact; environment recreation still depends on compatible SDKs, base images and separately provisioned private configuration.

## Case studies

1. **Wazuh → AgentTree → Discord** — receive real external security events, orchestrate the generic hierarchy, produce a reviewed FinalResult and deliver it externally.
2. **Network Configuration** — evaluate the same frozen platform with domain-specific Tree/configuration/input.
3. **Software Development** — evaluate the same frozen platform with domain-specific Tree/configuration/input.

These are planned consumers, not implemented by the freeze task. Next: **Case Study 1 — Wazuh → AgentTree → Discord**.

## Freeze policy

Platform feature development is frozen for thesis evaluation after this checkpoint. Only reproducible case-study defects, security defects or thesis-blocking integration defects justify a platform change. Every exception must be documented, tested and traceable to a new commit, with an explicit relationship to this baseline. Never rewrite/move these tags or mix unrecorded local Core changes into a case-study claim.
