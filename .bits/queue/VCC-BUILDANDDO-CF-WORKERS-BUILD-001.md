# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CF-WORKERS-BUILD-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CF-WORKERS-BUILD-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     .bits/srs/SRS-BUILDANDDO-CF-WORKERS-BUILD-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-CF-WORKERS-BUILD-001-* branches
# Intent:      Track the record of the orphan Worker and the owner's disconnect.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CF-WORKERS-BUILD-001

**SRS:** SRS-BUILDANDDO-CF-WORKERS-BUILD-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

The cause of the permanent `Workers Builds: buildanddo` failure is recorded with evidence, and the
owner has the one setting to change.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Record the finding and the owner decision | `python -c "import pathlib,sys;t=pathlib.Path('.bits/srs/SRS-BUILDANDDO-CF-WORKERS-BUILD-001.md').read_text();print('PASS' if '415 builds' in t and 'Disconnect' in t else 'FAIL');sys.exit(0 if '415 builds' in t else 1)"` | done |
| 2 | Keep identifiers out of the public plane | `python scripts/ci/verify_public_boundary.py` | done |
| 3 | Owner disconnects Workers Builds from `buildanddo` (A3) | `gh api repos/mrnobodytx/buildanddo/commits/main/check-runs --jq '[.check_runs[].name] \| if any(startswith("Workers Builds: buildanddo")) then "FAIL" else "PASS" end'` | todo (owner) |

## Constraints

- Files this dispatch may touch: this file, the SRS, `.bits/srs_registry.yml`, generated locks.
- Files it must not touch: `apps/`, CI configuration, anything in Cloudflare.
- Raises the tier: any Cloudflare write, or adding account/Worker identifiers to the repository.

## Definition of done

- [x] Every gate command passes and the output is in the PR (task 3 is the owner's).
- [ ] `python scripts/ci/agent_context.py --check` passes.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
