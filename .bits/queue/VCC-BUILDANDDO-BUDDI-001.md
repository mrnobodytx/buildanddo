# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-BUDDI-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-BUDDI-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-BUDDI-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-BUDDI-001.md
# DAG Node:    none
# Intent:      Authorize the additive brand mark and Buddi mascot layers without data, schema or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-BUDDI-001

**SRS:** SRS-BUILDANDDO-BUDDI-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

The site shows the approved block mark, and Buddi guides the workspace front page
and celebrates only what the server has confirmed.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Brand assets, favicon, header and sidebar mark | `cd apps/web && npm run build && echo PASS` | done |
| 2 | Buddi figure and animation layer | `cd apps/web && npx vitest run src/components/buddi && echo PASS` | done |
| 3 | Engagement: Buddi fronts the existing next-action ranking | `cd apps/web && npx vitest run src/lib/__tests__/buddi.test.js src/components/buddi && echo PASS` | done |
| 4 | Achievements from server-owned facts, one-time celebration | `cd apps/web && npx vitest run src/lib/__tests__/buddi.test.js src/components/buddi && echo PASS` | done |
| 5 | Lint, Overview baseline, boundary and context | `cd apps/web && npm run lint && cd ../.. && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- May touch: `apps/web/public/brand/**`, `apps/web/index.html` (favicon only),
  `apps/web/src/components/buddi/**`, `apps/web/src/lib/buddi.js`,
  `apps/web/src/lib/__tests__/buddi.test.js`, `apps/web/src/hooks/useLearningSummary.js`,
  `apps/web/src/components/site/Header.jsx` and `apps/web/src/components/workspace/WorkspaceLayout.jsx`
  (mark only), `apps/web/src/components/workspace/NextWorkspaceActions.jsx`,
  `apps/web/src/components/workspace/EmptyState.jsx` (optional art),
  `apps/web/src/pages/workspace/OverviewPage.jsx`, this dispatch, the SRS, the registry,
  `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json` (refresh only).
- Must not touch: PocketBase hooks or migrations, scoring or verification logic,
  CI, deploy or private-plane files.


---

## Second dispatch under the same code (C-ONE, 2026-09-22) - kept verbatim on the 2026-09-23 converge

Two seats opened SRS-BUILDANDDO-BUDDI-001 independently within a day: the mascot/achievement layers above (BITS-CODEGEN, registered in .bits/srs_registry.yml) and the Assistant-to-Buddi rename below (C-ONE, shipped on the live trunk). The rename work is in the code; its record stays here under the same code rather than being renumbered after the fact.

# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-BUDDI-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     .bits/srs/SRS-BUILDANDDO-BUDDI-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-BUDDI-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch of the operator's 2026-09-22 directions with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-BUDDI-001

**SRS:** SRS-BUILDANDDO-BUDDI-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

Members see Buddi instead of "assistant", the site serves its own icons and an install manifest,
and no release note reaches the wiki, Discord or Reddit carrying an IP address or a fleet machine
name.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Rename user-visible assistant strings to Buddi | `node --test tests/upgrade/workspace-assistant.test.mjs` | in_progress |
| 2 | Pin the rendered wording | `npm --prefix apps/web exec -- vitest run src/components/workspace/__tests__/WorkspaceAssistant.test.jsx` | in_progress |
| 3 | Brand icons, theme color and install manifest | `npm run build` | in_progress |
| 4 | Withhold every IP address and fleet machine name from published release text | `python -m unittest tests.upgrade.test_activity_publish` | in_progress |

## Constraints

- Files this dispatch may touch: the assistant component, client and hook, their two test files,
  `docs/workspace-assistant.md`, `docs/submission-guide.md`, `apps/web/index.html`, new files in
  `apps/web/public/`, `scripts/publish/activity_publish.py`, its new test, and this bookkeeping.
- Files it must not touch: CSP and Permissions-Policy (edge worker, nginx), routes, collections,
  migrations, deployment scripts.
- Raises the tier above A2: any deploy, push or external write. None is performed here.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/agent_context.py --check` passes (blocked while the readiness review is stale).
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
