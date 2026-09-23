# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/world-events-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     docs/world-events.md, tests/world_twin/check_world_twin.py, tests/upgrade/sprint-journey.test.mjs, .bits/handoffs/2026-09-23-bits-codegen-cmax-b-world-events.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/world-events.md; VERIFIED_BY tests/world_twin/check_world_twin.py; VERIFIED_BY tests/upgrade/sprint-journey.test.mjs; CONSUMES .bits/handoffs/2026-09-23-bits-codegen-cmax-b-world-events.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain source interoperability evidence and runtime limits for the connected world-event, episode and semantic projection path.
# ----------------------------------------------------------------

# World-event interoperability report

## §1 SUMMARY

Status: PARTIAL (connected local source path implemented; live receiving feeds,
canonical ingestion, native/browser and deployment acceptance remain unmeasured).
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. CKS Gate: pending. CKS/CAPS/CK: pending.
No additional product page, truth store, model runtime or event bus is introduced.

## §2 TASK RESULTS

WE-1: PASS for source. `WorldEvent` composes the existing strict `CitadelEvent`
without changing its ID or the semantic v2 vocabulary. Tenant, attribution,
visibility, correlation, release and opaque references are content-bound.
Verify: `python -m unittest tests.world_twin.test_interop.WorldContractTests tests.world_twin.test_interop.WorldIngestionTests`.

WE-2: PASS for source. Correlated replay partitions tenant/mission/release and
retains authority-separated strict attempt lineage. User, agent, guild, project
and community views reuse `semantic-twin.graph/v2`. Exact review admission reuses
receiving `ReviewPolicy`; source labels and self-pins grant no verification.
Verify: `python -m unittest tests.world_twin.test_interop`.

WE-3: PASS for synthetic connected tests. The production native capture path
retains exact canonical bytes, the browser validator checks them, and Python
imports its actual output into private A0 observations and a scoped graph. Owner,
requester and executor attribution remain separate; raw bodies do not enter the
derived projection. Existing browser exports without the added strings remain
readable, but strict Python import requires fresh exact-byte exports.
Verify: `node --test tests/upgrade/sprint-journey.test.mjs` and
`python -m unittest tests.world_twin.test_capture tests.world_twin.test_world_cli`.

WE-4: PARTIAL for operational acceptance. Required source discovery and the
existing Python 3.11/3.12 world-twin coverage job include the new tests. The
eighteen-profile acceptance matrix is unchanged. Receiving identity/read/share
scope, source authentication and live reviewed outcomes remain explicit work in
the existing activation lane and the world-event handoff.

## §3 SMOKE TEST RESULTS

- Focused world tests: 82 passed, zero failures/skips, on Python 3.11.15 and
  3.12.13. The existing coverage command reports 93.00-100 percent statement
  coverage across all implementation modules; this is not branch coverage.
- Connected native-export/client/Python path: 28 Node cases pass. The data and
  storage/transport doubles are explicitly synthetic, including Unicode and
  JavaScript numeric spelling controls. No live source was read.
- Broad Node source regression: 635 passed, zero skipped, on Node 22.17.0.
  The limited source diagnostic resolves its already installed ESLint through
  the local npm prefix; that is not locked frontend lint or rendered acceptance.
- Reused semantic/evolution/review contracts: 92 existing cases passed.
- Ruff and strict mypy pass for the world-twin implementation and new test files.

Red/green evidence is retained in the test cases. Initial review reproduced:
duplicate graph identities when one event referenced another; actor/read-scope
cuts rejecting a valid hidden predecessor; rejection of existing dotted event
names; conflation of different subjects in one source capture; native mission
views dropping their related records; and later review assertions retaining an
earlier graph revision/time. The regression tests pass after their respective
fixes. In the five-case seam run, two assertions and three errors preceded green.

Validation boundaries: neither source doubles nor 100 percent line coverage
authenticate a vendor, reviewer or deployment. No frontend install, provider
connection or native binary is supplied by this code. Run the unchanged full
acceptance command on the final committed candidate and retain all failed/blocked
profiles; the earlier learning-loop acceptance HOLD is historical evidence, not
an acceptance receipt for these new bytes.

## §4 MEMORY INGEST

The existing upgrade memory payload retains all 218 historical Type C events.
File metadata and declared edges are refreshed for this source continuation;
new entries record the test results and receiving limits, not live outcomes.
Counts live in its summary. Verify with
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## §5 CKET FILING

Implementation stays in the existing world-twin, mission export and browser
validator owners. Tests remain in world-twin and connected upgrade suites.
The protocol guide is 06_PLAN; this report and receiving note are 11_COMMIT.
Every new file has a CGRF header. REFLEX and CK remain receiving/post-merge work.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. The pre-existing A2 upgrade dispatch covers this
public-source integration. Native permissions, human approval, review and the
private canonical-state boundary remain unchanged. No secret access, live probe,
provider call, shared-backend mutation, CI trigger, A3 action or deployment
occurred. A local scope file is not proof of access. Hash consistency is not
authentication, and correlation is not causation. The compiler grants no
capability, credential, reputation, reward or authority.

## §7 NEXT ACTIONS

Receiving owners must authenticate actor mappings and exact review pins, derive
event-level read and sharing scope from existing native/CSEG policy, retain raw
evidence privately, connect approved provider adapters, and capture an actual
same-release mission-to-event-to-graph journey. Unknown age or missing public
sharing approval stays withheld. Native/browser, hosted CI and deployment
acceptance remain required; no existing gate was disabled.

Handoff: `.bits/handoffs/2026-09-23-bits-codegen-cmax-b-world-events.md`.
The scoped complete exporter is the first connected source. This is not a claim
that every BuildAndDo surface or any private provider already emits live events.
