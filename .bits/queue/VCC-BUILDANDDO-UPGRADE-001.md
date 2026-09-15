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

## Continuation authorized 2026-09-15

The owner's request to reuse backend functions from the logged-in sections
extends this in-progress dispatch under SRS-BUILDANDDO-UPGRADE-001 at A1.
PR 19 merged the initial implementation; its previously blocked frontend
checks are not inferred to have passed. The continuation adds these tasks:

| Phase | Task | Gate command | Status |
|---|---|---|---|
| K | Inventory and register backend reuse | `python scripts/ci/agent_context.py --check` | done |
| L | Connect home previews and challenge history to existing workspace hooks | Targeted home/selection suites | partial — source complete, selector tests pass; component execution unavailable |
| M | Share authenticated Field Manual and progress with Docs | Targeted tutorial/account-isolation suites | partial — source and regression suites complete; component execution unavailable |
| N | Verify and record continuation evidence | Web checks, Node tests, context, boundary and memory checks | done — blocked checks recorded |

Existing collections and access rules are the authorization boundary. No new
backend deployment or live workspace mutation is performed. The sandbox still
has no authenticated workspace for publishing a seat event; record local
evidence without fabricating a public event.

Continuation gate results: K PASS; L selector gate PASS (7/7), component gate
FAIL to start (Vitest absent); M source gate PASS, component gate FAIL to start;
N PASS for local evidence, with 4/7 dispatch smoke checks passing. Full Node
regression: 22/22. Python: 18/18. Offline source parser: 174 modules, no static
errors. Browser and native/live backend acceptance remain unverified. See the
updated cumulative report and memory payload for runnable commands and limits.

## Mission education continuation authorized 2026-09-15

The owner requested the mission system, its how/why instruction, NIST TEVV,
OWASP, clarification of "wor3 voc", and educational animation/rewards. This
continues the same in-progress A1 dispatch and registered umbrella. Prior
merged source remains the baseline; no shared backend is mutated in this run.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| O | Register the mission scope and inspect existing mission/evidence rules | `python scripts/ci/agent_context.py --check` | done |
| P | Persist plans and enforce lifecycle/evidence constraints | Node mission policy, migration and request-hook tests | partial — 20/20 local contract tests pass; native runtime acceptance pending |
| Q | Add guided planning, review and how/why learning | Targeted mission component suites | partial — source and suites complete; Vitest unavailable |
| R | Add educational rewards and accessible animation | Reward tests and reduced-motion UI checks | partial — reward selectors pass; component/browser checks unavailable |
| S | Record source, validation and memory evidence | Context, boundary, memory and web gates | done — unavailable acceptance checks recorded |

Memory brief: Missions already have CRUD and six status values but status
advancement is not evidence-gated. The Evidence Ledger has mission and workspace
relations. Reuse these instead of inventing another task store. Prior frontend
checks could not run because required packages were absent. NIST TEVV is a
method for gathering evidence, not a certificate produced by filling a form.

Mission gate results: O PASS; P local contract gate PASS (20/20), native acceptance
pending; Q component gate FAIL to start; R selector gate PASS, UI gate unexecuted;
S evidence gate PASS with smoke 4/7. Full Node regression: 42/42. Python: 18/18.
Source parsing: 180 modules, no static errors. Targeted Vitest and coverage are
unavailable, official lint lacks eslint-plugin-import, and Vite cannot start.
"wor3 voc" is provisionally treated as W3C Verifiable Credentials pending a reply;
the local learning download is explicitly unsigned. No live seat event, shared
mutation, deployment or credential signing was performed.
