# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/mutual-development.md, tests/upgrade/check_work_exchange.py, .bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-validation.json, .bits/handoffs/2026-09-30-bits-codegen-cscc-work-exchange.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/mutual-development.md; VERIFIED_BY tests/upgrade/check_work_exchange.py; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-validation.json; CONSUMES .bits/handoffs/2026-09-30-bits-codegen-cscc-work-exchange.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Record the implemented reciprocal work boundary, measured source evidence and unexecuted private integration without self-certifying a live loop.
# ───────────────────────────────────────────────────────────────

# Mutual development source report

## §1 SUMMARY

Status: PARTIAL for live integration; public source exchange implemented.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
Tasks: 3/3 source phases. Smoke: 164/164 connected cases on each declared Python
version, including 46 dedicated work exchange cases. CKS Gate/CKS/CAPS/CK: pending.
Review publication is managed by the session UI.

The existing development mission producer, canonical contracts, independent
review policy, candidate provenance and Merkle epochs now share a portable work
and result flow. The public implementation performs local validation, packaging
and projection. The CSCC/native adapters, real worker assignment, hosted CI,
deployment, external readback and signing remain receiving work. The earlier
Buddi/workspace repairs and their historical source evidence are retained.

## §2 TASK RESULTS

| Phase | Result | Verify |
|---|---|---|
| MD-1 | Strict `buildanddo.work/v1` and result contracts bind both directions, four lanes, source, scope, paths, acceptance and reported worker identities. Existing ReviewPolicy/VerificationReceipt controls separate reported from reviewed outcomes. | `python -m unittest tests.upgrade.test_work_contracts` |
| MD-2 | Existing mission packets convert with retained origin digests. Actual candidate provenance and evidence bytes enter the existing epoch. History deduplicates attempts and later independent reviews without inventing success rates or authority. | `python -m unittest tests.upgrade.test_work_exchange tests.upgrade.test_work_cli` |
| MD-3 | A source-bound Buddi/workspace dogfood proposal, CSCC receiving matrix, local validation report and mandatory GitLab coverage lane are prepared. Readiness intent and owner next actions retain runtime gaps. | `python tests/upgrade/check_work_exchange.py`; readiness/context/boundary/memory commands below |

Source lives in the existing `libs/evolution` package and CI producers; usage
is in `docs/mutual-development.md`. The first proposal is
`.bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-dogfood.json`.
It pins an inspected local source object; the receiving owner must confirm
propagation or review a new contract before choosing another starting revision.
Its required deployment and runtime evidence are not populated by local tests.

## §3 SMOKE TEST RESULTS

Measured source fingerprints, interpreter profiles, coverage and the complete
regression command are retained in `mutual-development-validation.json` beside
this report. Test artifacts use explicitly synthetic workers, provider IDs,
results and review pins; no authentic GitLab/CSCC outcome is claimed.

| Check | Observed result |
|---|---|
| Dedicated work exchange gate | PASS: 46/46, zero skips, on Python 3.11.15 and 3.12.13. New work modules measure 99.15–100% statement coverage; candidate provenance measures at least 96.12%. Python trace coverage is not branch coverage or pytest-cov. |
| Connected existing producers/consumers | PASS: 164/164 per Python version, zero skips. Includes development proposals/reviews, capability contracts, actual standalone mission archive execution and reachable GitLab coverage wiring. These 164 include the 46 dedicated cases. |
| Candidate mismatch red/green | Two original tests failed: CI metadata could relabel checkout evidence with a different SHA. Both pass after the guards. The epoch workflow now pins its event candidate and separately reads current chain history. |
| Arrival-order control | An added test exposed a later pinned review being discarded after an identical unreviewed result. The corrected projection is order-independent and still counts one attempt. |
| Typing and source diagnostics | PASS: strict mypy on three new implementation modules; Ruff on changed Python source/tests; both changed workflow documents parse; the progression descriptor passes the existing limited JSX syntax/binding diagnostic. |
| Actual browser, native and hosted acceptance | NOT RUN. React, Vitest and Vite are absent in this sandbox; no locked web build/rendered checks, native PocketBase, hosted workflows, CSCC, provider, release or external readback result is asserted. |

The first broader run was interrupted after sandbox subprocess restrictions.
Authorized local subprocess access allowed the real disposable fixtures to run.
That run exposed optional epoch imports breaking the standalone mission archive;
work dependencies are now loaded only for explicit work bundles. It also exposed
three existing CLI fixtures whose fixed September 21 observations had aged beyond
the seven-day policy. Their synthetic clock is now shared near the test run;
production TTLs and explicit stale/future rejection controls are unchanged.
The CI wiring expectation was extended to include the new required coverage
command and retained artifact. Both final interpreter runs pass.

```bash
python tests/upgrade/check_work_exchange.py
python -m mypy --strict --explicit-package-bases --follow-imports=silent libs/evolution/work.py libs/evolution/work_exchange.py libs/evolution/work_cli.py
python -m libs.evolution.work_cli validate-work .bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-dogfood.json
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
```

Final repository governance checks pass: all 12 Hostinger milestones have
current source bindings, and submission readiness retains 11 checkpoints of
12 planned with official rules still unknown. Agent context matches the
repository inventory of 62 findings and 32 unwired gates; these are not claims
of broken live services. The public boundary check covers 1,839 files with no
failures. These checks establish source consistency, not operational acceptance.

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
The existing cumulative history is preserved. The validator passes with 1,010
Type A records, 2,668 Type B edges and 256 Type C events, complete IOO fields,
exact declared edges and zero orphans.
No private memory service is called. New events record observed source failures,
repairs, final tests and the prepared receiving handoff.

## §5 CKET FILING

04_HYPOTHESIZE: existing upgrade spec and agent gate description.
06_PLAN: mutual-development guide and connected development/sprint docs.
07_BUILD: work contracts, local exchange and CLI in `libs/evolution`.
08_TEST: source behavior/coverage cases and existing integration controls.
11_COMMIT: candidate/epoch producers and workflows, dispatch/readiness bindings,
dogfood proposal, validation report, receiving handoff and memory.
New code/doc files carry CGRF headers; JSON artifacts have sibling metadata.
Private REFLEX/signing remains deferred to its receiving owner.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. Existing license posture is unchanged.
Actor: actor:agent; publication must apply exactly that one actor label.
Authority: A2 source, with candidate-only public work. No secret access, private
source, live effect, automatic promotion or deployment grant is introduced.
No payment code is changed. Public release still requires the existing boundary
and receiving publication checks. Hashes and declared account bindings do not
authenticate a worker, review or external result; receiver-supplied pins are
required independently of the submitted bundle.

## §7 NEXT ACTIONS

Receiving owners follow
`.bits/handoffs/2026-09-30-bits-codegen-cscc-work-exchange.md`:
authorize/assign the real dogfood mission, map canonical identities, execute
GitLab/native/browser acceptance, independently review the exact candidate,
perform the separately authorized release/readback, and return native evidence
and derived worker history. Private signing and public publication remain with
their existing owners. The prepared work packet is not a completed mission.

Rollback: revert this source change through review, stop selecting new work
bundles, and retain issued contracts/results as immutable history. Work exchange
adds no database migration or runtime activation to compensate. If source is
reverted, retain the exact-SHA guards or keep epoch publication held until the
receiving workflow proves its checkout identity. Existing unrelated acceptance
gates and prior source evidence remain required.
