# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# DAG Node:    none
# Intent:      Track the authorized eight-area implementation and its verification gates.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-UPGRADE-001

**SRS:** SRS-BUILDANDDO-UPGRADE-001 **Risk:** A1 **Seat:** BITS-CODEGEN
**Status:** in_progress **Actor:** actor:agent

## Authorization and objective

Owner Dmitry Richard explicitly authorized task-table creation, SRS registration
and all eight upgrades in a single PR. The objective is the acceptance surface
in .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md and its four referenced telemetry specs.
Scope is local source implementation and review; shared/staging mutations are
excluded. Existing CGRF provenance is preserved. New files carry this dispatch.

## Task table

| Phase | Task | Gate command | Status |
|---|---|---|---|
| A | Register scope and dispatch | `python scripts/ci/agent_context.py --check` | done |
| B | Add five public pages and navigation | `npm --prefix apps/web test` | partial — source implemented; acceptance pending |
| C | Expand critical component coverage | `npm --prefix apps/web run test:coverage` | partial — source implemented; acceptance pending |
| D | Split routes and preserve recovery | `npm --prefix apps/web run build` | partial — source implemented; acceptance pending |
| E | Improve mobile layouts | Production-preview viewport and menu checks | partial — source implemented; acceptance pending |
| F | Complete public-plane telemetry scope | `node --test tests/upgrade/*.test.mjs` and `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | done — local adapters |
| G | Generate crawler assets and page metadata | `node --test tests/upgrade/build.test.mjs` | done — generator |
| H | Theme public, auth and workspace surfaces | Theme interaction suites and preview checks | partial — source implemented; acceptance pending |
| I | Verify keyboard access, labels and focus | `npm --prefix apps/web test` and preview checks | partial — source implemented; acceptance pending |
| J | Record memory, evidence and handoff | `python scripts/ci/agent_context.py --check` and `python scripts/ci/verify_public_boundary.py` | done |

## Smoke gates

```bash
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run build
node --test tests/upgrade/*.test.mjs
python -m unittest discover -s tests/upgrade -p 'test_*.py'
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

Emit PASS/FAIL after each phase. Diagnose failed gates before advancing; retain
root cause and retest evidence. No live PocketBase workspace or authenticated
seat is provided in this sandbox, so no seat event is fabricated or sent.

## Memory brief

The supplied source conversation and prior repository briefing were read. Prior
art includes the broadsheet UI, Vitest runner, page boundaries, browser telemetry
helpers and four proposed telemetry specifications. Private agent-system coupling
is a separate task and is excluded here.

## Acceptance state

Source implementation covers all eight areas. Node adapters pass 15 tests and
Python adapters/contrast pass 18. Vitest, production build, official lint and
browser acceptance are blocked by unavailable frontend dependencies and the
pre-existing incomplete lockfile. Registry audit and native PocketBase/Datadog
checks are not claimed. The dispatch remains in progress and the PR must remain
a draft until these acceptance gates run.

Evidence: .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md
Memory: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Private activation: .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md

Final local governance: context lock PASS (6 retained findings, 4 unwired gates);
public boundary PASS (397 files, zero failures). The provider actor label remains
a PR check. Dispatch smoke: 4/7; frontend environment failures are detailed in the report.
