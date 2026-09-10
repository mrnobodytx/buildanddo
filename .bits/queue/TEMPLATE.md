# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/TEMPLATE.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-* branches
# Intent:      Give a dispatch a fixed shape so progress is checkable mid-flight.
# ───────────────────────────────────────────────────────────────

# Dispatch <DISPATCH_ID>

**SRS:** <SRS-CODE> **Risk:** A0/A1/A2 **Seat:** <SEAT> **Status:** ready

Copy this file to `.bits/queue/<DISPATCH_ID>.md` and fill it in. Delete a queue
file once its PR is merged; the SRS registry status carries the history.

## Objective

One sentence. What is true after this dispatch that is not true now.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 |      |              | todo   |
| 2 |      |              | todo   |

Every task needs a gate command that prints PASS or FAIL. A task with no
runnable check is not a task, it is a hope.

## Constraints

- Files this dispatch may touch:
- Files it must not touch:
- Anything that would raise the risk tier above the one authorised above:

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/agent_context.py --check` passes.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
