# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/governance-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/out/VCC-BUILDANDDO-UPGRADE-001/governance-validation.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/governance-validation.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json; VERIFIED_BY tests/upgrade/test_gitlab_acceptance.py
# Intent:      Preserve the governance routing repair and real local failures so receiving owners can distinguish source verification from provider execution.
# ───────────────────────────────────────────────────────────────

# Governance execution repair

GitHub's eleven governance jobs for PR 64 stopped before executing any steps;
the provider annotation identifies an account billing lock. That is distinct
from GitLab execution and from Cloudflare's separate failed build. The local
readiness, context and memory gates already passed before this repair.

The source correction moves the remaining required checks into GitLab, keeps
GitHub governance as an explicitly dispatched diagnostic, and restores actor
attribution for GitLab review pipelines. Executing the moved checks also exposed
and repaired an independent coverage failure: the mission checker measured the
business worker without selecting its existing tests.

## §1 SUMMARY

Status: PARTIAL — local source repair complete; hosted results unmeasured.
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm
Tasks: 3/3 local source tasks.
Smoke: 9/11 test commands PASS; two dependency-required commands FAIL.
CKS Gate: B+/75 target; CKS: pending; CAPS: pending; CK: pending.
Commits: 1 repair implementation (25083e57208df367a1ef437e76be8e6b45ae42c9); evidence recorded separately.
Reviewed source: 506b2da60aa06a6ae6323fac7f5aa0b80c9fded6386dee4421dfda08a01ed436.

The two failing commands require native Discord/PDF packages absent locally.
No fresh eighteen-profile acceptance, hosted GitLab run, native PocketBase,
rendered frontend or deployment is asserted. The prior 4/18 acceptance result
belongs to the earlier candidate recorded in gitlab-validation.json.

## §2 TASK RESULTS

- GV-1 PASS: identified eleven zero-step GitHub failures, no actor label on the
  inspected public PR, and the missing GitLab routing/attribution coverage.
  Verify: `gh run view 35664137943 --repo mrnobodytx/buildanddo --json jobs`
  and `gh pr view 64 --repo mrnobodytx/buildanddo --json labels`.
  These are historical provider observations, not GitLab acceptance.
- GV-2 source PASS: GitLab retains native SDK/parser gates, worker/submission
  coverage and both Python versions of foundry, portfolio and mission suites.
  The manual bundle waits for those jobs. The GitHub fallback resolves one SHA
  for all jobs; missing, multiple or foreign review attribution fails.
  Verify: `python -m unittest tests.upgrade.test_public_boundary tests.upgrade.test_gitlab_acceptance -v`.
  Files: CI fragments, boundary checker and regression suites. CKET: 11_COMMIT,
  08_TEST; contribution descriptions: 07_BUILD and 04_HYPOTHESIZE.
- GV-3 local PASS: reproduced zero business-worker coverage, selected its
  existing tests and measured passing coverage on Python 3.11 and 3.12.
  Retained all actual results and receiving obligations without changing floors.
  Verify: `python tests/upgrade/check_mission_suite.py`, the test commands below,
  both readiness checks, `python scripts/ci/agent_context.py --check` and
  `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.
  Files: mission checker, governance/docs, locks and retained evidence.
  CKET: 08_TEST, 04_HYPOTHESIZE, 06_PLAN, 11_COMMIT.

## §3 SMOKE TEST RESULTS

Each command was required to exit zero without skipped required tests and to
meet its existing coverage floor. Python 3.11.15 and 3.12.13 were installed
locally; no package downloads or hosted job triggers were performed.

| Command/check | Expected | Observed | Result |
|---|---|---|---|
| `python -m unittest` over the seven governance modules in `day21_governance` | No failed or skipped cases | 103 cases pass | PASS |
| `python tests/upgrade/check_sprint_execution.py` | Passing tests and >=80% per module | 35 cases; 93.75–99.22% | PASS |
| `python3.11 tests/upgrade/check_mission_suite.py` | Passing tests and >=80% per module | 40 cases; 87.17–99.55% | PASS |
| `python3.12 tests/upgrade/check_mission_suite.py` | Passing tests and >=80% per module | 40 cases; 87.96–99.55% | PASS |
| `python3.11 tests/upgrade/check_federal_foundry.py` | Passing tests and >=80% per module | 66 cases; all floors pass | PASS |
| `python3.12 tests/upgrade/check_federal_foundry.py` | Passing tests and >=80% per module | 66 cases; all floors pass | PASS |
| `python3.11 tests/foundry/check_foundry.py` | Passing tests and >=80% per module | 70 cases; 90.72–100% | PASS |
| `python3.12 tests/foundry/check_foundry.py` | Passing tests and >=80% per module | 70 cases; 90.62–100% | PASS |
| `node --test tests/upgrade/suite-system.test.mjs tests/upgrade/suite-client.test.mjs tests/upgrade/government-learning.test.mjs` | No failed or skipped cases | 30 cases on Node 22.17.0 | PASS |
| `python tests/upgrade/check_discordbot.py --include-research --require-sdk --require-pdf` | Required native dependencies and no skips | 138 passing cases, four skips; SDK/PDF unavailable | FAIL |
| `python tests/upgrade/check_blueprint_pipeline.py --require-pdf` | Required PDF backend and no skips | 69 passing cases, four skips; PDF unavailable | FAIL |

The suites overlap; do not sum their case counts. Exact commands, log hashes,
per-module coverage and observed process results are in governance-validation.json.
The Python 3.11 executable was selected by its installed path because the default
pyenv shim selected 3.12; no interpreter was installed during this run.

Red/green evidence:

1. Initial routing/actor regressions failed against the automatic GitHub trigger,
   missing GitLab coverage jobs and unsupported GitLab attribution mode. The
   final focused set passes 103 cases. Missing explicit review exports also now
   fail instead of silently omitting the actor gate.
2. Mission coverage initially exited one despite 23 passing cases because
   business_worker.py had 0/368 measured lines. Loading the existing worker tests
   produced 40 passing cases per interpreter; worker coverage is 93.11% on 3.11
   and 93.75% on 3.12. Every module and the 80% floor remain in the checker.
3. Required Discord/PDF commands still exit one for unavailable dependencies.
   The GitLab job installs the declared requirements and preserves both required
   flags. Their hosted execution is pending; no simulated package or waived
   dependency is counted as a fix.

Boundary attribution has 174/186 executable lines covered (93.55%). This and
the existing coverage checkers use stdlib trace; no branch-coverage claim is made.
Strict typing passes for the boundary checker and 15 foundry modules. Ruff and
format checks pass. The GitHub/GitLab YAML parses locally, and every fallback
checkout uses the resolved candidate SHA. GitLab's merged configuration and
runner environment were not queried. Foundry's local 3.12 coverage run took
532.722 seconds; its GitLab budget is 20 minutes for coverage plus run/export
verification, without changing any assertion or threshold.

## §4 MEMORY INGEST

Type A count: 738
Type B count: 1643
Type C count: 171
IOO compliance: complete. DKG orphans: 0.
Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
All 166 baseline event vectors remain unchanged. Verify with the dispatch
memory checker and the baseline comparison recorded in the validation file.

## §5 CKET FILING

New CI configuration and handoff: 11_COMMIT. New regression test: 08_TEST.
Report, validation JSON and its CGRF sidecar: 11_COMMIT. New files have CGRF
headers or the JSON sidecar; existing files retain their established stages.
REFLEX remains deferred to the receiving private pipeline; no CK signature was
computed. Verify: the dispatch memory checker validates header/edge consistency.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. License posture: unchanged; no new rights asserted.
Boundary and incremental restricted-path/secret checks pass. Actor-label
application and remote status publication were not performed. The inspected
public PR's `Bits AI` label is not an actor label. The receiving integration
owns the provenance of exported review metadata; the checker validates its
consistency, not an independent signature. Stripe mode: not applicable; no
checkout code changed. CK/CAPS/CKS remain pending.

## §7 NEXT ACTIONS

The GitLab/repository owner confirms candidate delivery, supplies trusted review
metadata, executes the required jobs and publishes their results against the
same public SHA before updating required-status settings. Exactly one actor
label is needed on the review. Old failed GitHub checks remain historical.
The separate Cloudflare build diagnostic is still unavailable.

Handoff: `.bits/handoffs/2026-09-21-bits-codegen-cmax-b-governance-execution.md`
to CMAX-B and the CI owner. Suggested next dispatch: owner-issued provider
integration and candidate acceptance; no new private dispatch ID is invented.
No out-of-scope bug comment, external notification, rerun or deployment was
sent. The existing 22 unwired-gate and two unregistered-spec findings remain
visible; this continuation does not conceal them or claim fleet-wide health.
