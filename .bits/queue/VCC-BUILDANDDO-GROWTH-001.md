# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-GROWTH-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GROWTH-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GROWTH-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-GROWTH-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-GROWTH-001-* branches;
#              DEPENDS_ON .bits/srs/SRS-BUILDANDDO-GROWTH-001.md
# DAG Node:    none
# Intent:      Record the owner's request for a system development and progression tracker kept
#              like the context lock, without deployment, secret or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-GROWTH-001

**SRS:** SRS-BUILDANDDO-GROWTH-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

Owner request, 2026-09-24: "add a progression tracker and system development tracker … the same way
we have a context lock but for system development and growth tracking". The owner chose automatic
refresh on `main` over a lock required on every PR. The workflow and gate wiring are A2 because they
touch shared CI. This dispatch records the request and does not self-authorize anything beyond it.

## Objective

`.bits/growth.lock.json` measures every system and the progress of every dispatch from the
repository alone. It is refreshed on every merge to `main`, so its history is the growth history.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Growth measurement, lock, diff and history, with controls | `python -m unittest tests.upgrade.test_system_growth && echo PASS` | done |
| 2 | Lock committed and current | `python scripts/ci/system_growth.py --check && echo PASS` | done |
| 3 | Refresh workflow on `main`; PR delta in the job summary; GitLab wiring | `python scripts/ci/agent_context.py --check && echo PASS` | done |
| 4 | README and CLAUDE.md name the tracker | `python scripts/ci/readme_check.py --check && echo PASS` | done |
| 5 | Boundary and readiness | `python scripts/ci/verify_public_boundary.py && python scripts/ci/hostinger_readiness.py --check && echo PASS` | done |

## Constraints

- May touch: `scripts/ci/system_growth.py`, `.bits/growth.lock.json`, `.github/workflows/growth.yml`,
  `.github/workflows/pr-governance.yml` and `.gitlab-ci.yml` (one step each),
  `tests/upgrade/test_system_growth.py`, `README.md`, `CLAUDE.md` (one orientation line), this
  dispatch, the SRS, the registry, `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json`.
- Must not touch: application code, migrations, deployment execution, secrets, private-plane files.
- The workflow writes only `.bits/growth.lock.json`, and only to `main`.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
