# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/USO-BUILDANDDO-PLATFORM-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-PLATFORM-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-PLATFORM-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-13
# Depends:     .bits/srs/SRS-BUILDANDDO-PLATFORM-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-PLATFORM-001-* branches;
#              VALIDATES apps/web/src/pages/PlatformPage.jsx
# Intent:      Authorize and verify the public MetaFunction Fabric visual experience.
# ───────────────────────────────────────────────────────────────

# Dispatch USO-BUILDANDDO-PLATFORM-001

**SRS:** SRS-BUILDANDDO-PLATFORM-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

BuildAndDo exposes a responsive `/platform` page that visually explains and
previews the governed MetaFunction capability fabric without reading private or
live operational data.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS and dispatch | `python scripts/ci/agent_context.py --check` | done |
| 2 | Build the reusable architecture flow and capability orb | `npm --prefix apps/web test -- --run` | partial |
| 3 | Build the illustrative capability dashboard | `npm --prefix apps/web test -- --run` | partial |
| 4 | Compose and register the public platform page | `npm --prefix apps/web run build` | partial |
| 5 | Validate responsive, reduced-motion and interaction states | `npm --prefix apps/web run lint` | partial |
| 6 | Verify public governance boundaries | `python scripts/ci/verify_public_boundary.py` | done |

## Constraints

- Files this dispatch may touch: `.bits/srs_registry.yml`, this SRS and queue
  entry, `.bits/context.lock.json`, `apps/web/src/App.jsx`, and platform page,
  component, style and focused test files under `apps/web/src/`, plus the
  shared site header and footer needed to make secondary-page links resolve.
- Files it must not touch: PocketBase data, deployment controls, private evidence,
  secrets, `.github/workflows/notify-citadel.yml`, or private-stack integrations.
- Anything that would raise the risk tier above A1: provider network calls,
  backend schema changes, or mutations outside the local feature branch.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/agent_context.py --check` passes.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status remains `in_progress` until merge verification.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
