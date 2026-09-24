# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/pr112-merge-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     tests/upgrade/read-failure-telemetry.test.mjs, tests/upgrade/public-action-telemetry.test.mjs, tests/upgrade/build.test.mjs, tests/upgrade/test_discordbot_telemetry.py
# EnumType:    Doc
# EnumEdges:   VERIFIED_BY tests/upgrade/read-failure-telemetry.test.mjs; VERIFIED_BY tests/upgrade/public-action-telemetry.test.mjs; VERIFIED_BY tests/upgrade/build.test.mjs; VERIFIED_BY tests/upgrade/test_discordbot_telemetry.py; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain PR 112's semantic merge decisions and measured integration limits without substituting source checks for runtime acceptance.
# ----------------------------------------------------------------

# PR 112 integration

## Section 1: Summary

Status: source conflicts resolved; acceptance remains PARTIAL.
SRS: SRS-BUILDANDDO-UPGRADE-001. Dispatch: VCC-BUILDANDDO-UPGRADE-001.
Seat: BITS-CODEGEN. Actor: actor:agent. Authority: A2 local integration.
CKS Gate/CKS/CAPS/CK: pending.

The owner requested resolving PR 112 on `claude/keen-pasteur-aoyiht`.
The merge combines its head `4e812b93cedd4c644d53fa049fa3905e6dcfd388` with
`origin/main` at `7d7c1c37dfb72426af28af8a48d8bd3465ad5987`, including PR 113's
telemetry repairs. Existing convergence, server grading, README/changelog/growth
automation and hygiene removals remain. Nine paths conflicted, as reported.

## Section 2: Task results

- Retain absent versus malformed context handling and emit bounded failure
  telemetry without conditional hooks or returning to a parsing crash.
- Preserve unavailable-control explanations alongside read/write classifications.
- Keep GET failure wording separate from uncertain POST outcomes; native receipt
  validation and late rejection fences remain inside mutation observation.
- Treat a missing knowledge route/mission as missing, not an entitlement refusal.
- End loading for discarded replay reads while suppressing obsolete failure or
  success events. Explicit refresh can recover and record the current snapshot.
- Keep Platform Health on the authenticated master-seat estate route. Both
  telemetry endpoint maps recognize it without publishing the full assessment.
- Preserve friendly absent/invalid room-projection messages and record sanitized
  status/failure observations without sending response contents.
- Keep the server-graded quiz and restore its control/grade observations through
  the bounded logger. Grade and control outcomes remain distinct, retries reuse
  a retained graded reply, and expired/revoked controls cannot publish late grades.
- Repair the earlier build-wrapper merge's stale subprocess-variable references
  and missing telemetry finalizer. The answer scan still runs after generated
  feeds and before telemetry admission; a failed build or leaked answer cannot
  reach the finalizer.
- Regenerate context/readiness/growth locks from combined source and the changelog
  from the named remote main ref. The local legacy main ref was older and is not
  the changelog's comparison target for this integration.

## Section 3: Verification

| Check | Observed result |
|---|---|
| Full Node source suite, Node 22.17.0 | 1,445 cases: 1,444 passed, zero failures, one real-Vite prerequisite skip; HOLD |
| Full Python source suite, Python 3.12.13 | 1,351 cases: 1,336 passed, seven existing readiness/submission failures and eight dependency skips; FAIL |
| README, growth and hygiene regression suites | 43 passed after regenerating the growth lock |
| Discord adapter, command, grading, public and telemetry selection | 87 cases: 86 passed, one missing native-SDK serialization prerequisite |
| Discord grading/telemetry selection, Python 3.11.15 | 32 passed, zero failures/skips; explicit SDK/transport doubles |
| Build wrapper, artifact guards, public lesson/catalogue and community quiz selection | 33 cases: 32 passed, one missing real-Vite prerequisite |
| Changed-web diagnostic | 81 modules; zero new static errors; six inherited HomePage test duplicate-key diagnostics retained |
| Scoped Ruff and strict service typing | PASS for the changed Discord source and telemetry test; not a whole-repository typing claim |
| README/changelog/growth/dependency checks | PASS; 190 README links, 21 system paths, 49 READMEs and 22 measured growth systems |

The first connected telemetry run exposed four source-harness mismatches after
the private endpoint and safe context merge. The harness now uses those actual
contracts and retains the original privacy/lifetime assertions. Broad Python
testing then exposed 14 quiz-constructor errors from the old local-grading
fixtures. Updated server-grading controls reproduced missing outcome logging
before the correction. The actual build-wrapper control reproduced the stale
Vite reference before repair and now checks generator/answer-scan/finalizer order.

The remaining seven Python failures are in the unchanged readiness/submission
suites and match the previously recorded milestone/profile and provisional
submission discrepancies. No assertion, required gate or skip was disabled.
Working-tree receipts and logs are in `/tmp/opencode/pr112-integration-checks`.
They are local integration diagnostics, not clean-release acceptance records.

Rendered React tests, lint and build were attempted but cannot start usefully:
Vitest, eslint-plugin-import and concurrently are absent. The native workspace
profile is BLOCKED on the absent declared PocketBase binary. No full native,
installed-SDK, browser, hosted CI or deployed result is inferred from source tests.

## Section 4: Memory

Preserve all 242 prior Type C events. Current file metadata drops only the 13
entries for files already removed by PR 112's reviewed hygiene change; history
remains in Git and the event records. Refresh remaining line counts and declared
edges, then append this integration observation. Check with
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## Section 5: Filing

Source and tests remain with their existing owners. This report and generated
metadata use 11_COMMIT. The existing upgrade SRS/dispatch records the owner's
continuation. REFLEX and CK remain receiving checks, not locally issued stamps.

## Section 6: Governance and rollback

Entity: Citadel Nexus Inc. Retain PR 112's actor:agent label and draft review.
Rollback is a separately reviewed source revert, preserving both parents and
their evidence. Do not restore answer-bearing catalogues, raw claim writes or
public estate details as a shortcut. No production change or external write
was performed; neither a regenerated lock nor a local merge grants that authority.

## Section 7: Next actions

Synchronize the resolution through the coding session's review update flow.
The acceptance owner must run the locked frontend and disposable native suites
and resolve the separate existing readiness/submission test discrepancies.
GitHub/Cloudflare failures quoted in the PR were not rerun or diagnosed as part
of this conflict-resolution task. Preserve their existing provider handoffs.
