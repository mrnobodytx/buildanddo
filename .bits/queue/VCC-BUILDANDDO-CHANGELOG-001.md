# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CHANGELOG-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-CHANGELOG-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-CHANGELOG-001-* branches;
#              DEPENDS_ON .bits/srs/SRS-BUILDANDDO-CHANGELOG-001.md
# DAG Node:    none
# Intent:      Record the owner's request for a complete README, a README regression gate and
#              changelog automation, without deployment, secret or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CHANGELOG-001

**SRS:** SRS-BUILDANDDO-CHANGELOG-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

Owner request, 2026-09-24: make the README professional, visual and complete (it named 2 of the 11 apps
and none of the CI definitions), add a regression check, and automate the changelog. The workflow and
gate changes are A2 because they touch shared CI. This dispatch records the request and does not
self-authorize anything beyond it.

## Objective

The README names every app, service and CI definition in the repository, and a gate fails when that
stops being true. CHANGELOG.md is regenerated on every push to `main` without anyone having to
remember.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | README regression check with controls for each rule | `python -m unittest tests.upgrade.test_readme_check && echo PASS` | done |
| 2 | README rewritten from a survey of the tree; generated roadmap and README catalogue blocks | `python scripts/ci/readme_check.py --check && echo PASS` | done |
| 3 | Changelog skip trailer, current CHANGELOG.md, refresh workflow on `main` | `python scripts/ci/changelog_gen.py --ref origin/main --check && echo PASS` | done |
| 4 | Gate wired into pr-governance.yml (blocking) and GitLab integrity_gate | `python scripts/ci/agent_context.py --check && echo PASS` | done |
| 5 | Boundary and readiness | `python scripts/ci/verify_public_boundary.py && python scripts/ci/hostinger_readiness.py --check && echo PASS` | done |

## Constraints

- May touch: `README.md`, `CHANGELOG.md`, `scripts/ci/readme_check.py`, `scripts/ci/changelog_gen.py`
  (the skip trailer and subject redaction only), `.github/workflows/changelog.yml`, `.github/workflows/pr-governance.yml` and
  `.gitlab-ci.yml` (one gate line each), `tests/upgrade/test_readme_check.py`, this dispatch, the SRS,
  the registry, `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json`.
- Must not touch: application code, migrations, deployment execution, secrets, private-plane files.
- The changelog workflow writes only `CHANGELOG.md`, and only to `main`, following the precedent of
  `.github/workflows/evidence-epoch.yml`. Anything broader raises the tier and needs a new dispatch.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
