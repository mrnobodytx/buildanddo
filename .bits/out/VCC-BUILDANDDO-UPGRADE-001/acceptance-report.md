# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/acceptance-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     tools/day21/day21_acceptance.py, tests/upgrade/test_day21_acceptance.py, .bits/out/VCC-BUILDANDDO-UPGRADE-001/acceptance-validation.json, docs/hostinger-sprint-closure.md
# EnumType:    Doc
# EnumEdges:   CONSUMES tools/day21/day21_acceptance.py; CONSUMES tests/upgrade/test_day21_acceptance.py; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/acceptance-validation.json; CONSUMES docs/hostinger-sprint-closure.md
# Intent:      Explain the repaired acceptance runner and the measured runtime prerequisites that still prevent complete acceptance.
# ───────────────────────────────────────────────────────────────

# Acceptance repair — 2026-09-21

The acceptance runner now rejects empty selections, revalidates raw receipts,
and records current native blockers after failed provisioning. It can use
explicit installed binaries without Docker builds. The actual acceptance result
remains **4/18 PASS, three FAIL, one HOLD and ten BLOCKED**. Fourteen profiles
remain unresolved; the earlier fifteenth was the already repaired Node fixture
profile. None of the fourteen has been relabeled as passing by this change.

## §1 SUMMARY

Status: PARTIAL  
Dispatch: VCC-BUILDANDDO-UPGRADE-001  
Seat: BITS-CODEGEN  
SRS: SRS-BUILDANDDO-UPGRADE-001  
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm  
Tasks: AC-1 source repair complete; AC-2 execution and evidence complete locally,
with full runtime acceptance blocked  
Smoke: 41/41 focused tests; 4/18 required acceptance profiles  
CKS Gate: B+ organization default; no numeric target declared by the registry  
CKS: pending; CAPS: pending; CK: pending  
Tested source commit: 42f5a375795299aeb8ac0e2e6c1f0a1691b3b81b

The later report, memory and measured inventory edits are separate from the
tested source candidate. They do not change the executable source or readiness
fingerprint and do not constitute acceptance of a later release candidate.

## §2 TASK RESULTS

AC-1 — PASS for source repair. The old invocation with both `--source-only` and
`--native-only` executed no checks, returned zero and printed PASS beside a HOLD
summary. The same invocation now rejects conflicting arguments with exit 2.
An incomplete summary also keeps the final exit nonzero after selected commands
succeed. The wrapper reuses the existing acceptance exporter, including log,
artifact, candidate and source checks, and refuses to overwrite prior evidence.
Failed provisioning still runs the existing receipt writer for all affected
native profiles. A supplied binary must pass the existing version check.

Verify: `python -m unittest tests.upgrade.test_day21_acceptance -v`  
Files: `tools/day21/day21_acceptance.py`, `tests/upgrade/test_day21_acceptance.py`  
CKET: 07_BUILD, 08_TEST

AC-2 — PARTIAL operational acceptance. All eighteen profiles produced fresh
receipts for one clean, unchanged source candidate. The actual runner returned
1 with `DAY21 ACCEPTANCE HOLD failed_commands=14 summary=HOLD`. No dependency
versions, lockfile, skips, required profiles or test thresholds were changed.

Verify on a provisioned runner with a new output directory:

```bash
python tools/day21/day21_acceptance.py --offline --pocketbase-package /path/to/pocketbase-0.39.8 --pocketbase-compose /path/to/pocketbase-0.28.4 --evidence-dir state/day21/acceptance/repair-002 --summary-output state/day21/evidence/repair-002/acceptance-summary.json
```

Replace only the two binary paths with the actual installed versions. Installed
npm and Python dependencies are also required. The executed local command used
`--offline` without supplied binaries; it is retained in the runner log pinned
by `acceptance-validation.json`. Stage: 11_COMMIT.

## §3 SMOKE TEST RESULTS

| Profile | Actual result | Evidence / remaining cause |
|---|---|---|
| boundary | PASS | Public boundary scan |
| dependency_lock | PASS | Declared manifest/lock consistency |
| source_node | PASS | 510 tests, zero failures or skips |
| source_python | HOLD | 725 cases, zero failures, six missing-dependency skips |
| semantic_twin | PASS | 122 tests, zero failures or skips |
| web_lint | FAIL | `eslint-plugin-import` absent |
| web_tests | FAIL | `vitest` absent |
| web_build | FAIL | `concurrently` absent |
| native_workspace:package | BLOCKED | PocketBase 0.39.8 absent |
| native_suite:package | BLOCKED | PocketBase 0.39.8 absent |
| native_learning:package | BLOCKED | PocketBase 0.39.8 absent |
| native_classroom:package | BLOCKED | PocketBase 0.39.8 absent |
| native_dossier:package | BLOCKED | PocketBase 0.39.8 absent |
| native_workspace:compose | BLOCKED | PocketBase 0.28.4 absent |
| native_suite:compose | BLOCKED | PocketBase 0.28.4 absent |
| native_learning:compose | BLOCKED | PocketBase 0.28.4 absent |
| native_classroom:compose | BLOCKED | PocketBase 0.28.4 absent |
| native_dossier:compose | BLOCKED | PocketBase 0.28.4 absent |

Every profile is an existing command in `scripts/ci/hostinger_checks.py`;
`python scripts/ci/hostinger_readiness.py --run <check> --runtime <profile>`
executes it. The validation JSON pins every exact receipt and log. The focused
and semantic-twin tests overlap the source Python suite; totals must not be added.

The seven initial regression tests had five failures and two errors for missing
options. All thirteen final runner tests pass. The combined runner, Day-21 and
readiness run passes 41/41. A test initially expected INVALID for a missing build
artifact; the shared validator's existing classification is STALE. The test was
corrected without changing validator policy. Synthetic success and Docker
extraction fixtures verify orchestration only; no native server ran here.

Stdlib trace including module loading and test execution covers 178/183 source
lines (97.27%) in the runner; this is not branch coverage. Ruff passes on the
runner and its tests. Strict mypy passes for the runner with
`--follow-imports=silent --explicit-package-bases`; transitive legacy typing is
outside that result. The first trace omitted module loading; the retained final
measurement includes it and excludes compiler line zero, which is not source.

Dependency restoration remains unapplied: the local npm toolchain, native
binaries and Docker images are absent, and none of the 191 cached Python wheels
is pypdf or Discord.py. Adapter-installed zod is 4.6.5, which cannot replace the
lock's 4.4.3. The network-restricted sandbox cannot provision these inputs.
On a connected runner, `npm ci` and the two declared Python requirements files
provide the intended dependency path. Re-run acceptance after installation;
the unexecuted web/native tests may still expose application failures.

GitHub run 35654152630 for PR 63 has eleven failed jobs and zero steps per job.
Check 106513509603 reports: "The job was not started because your account is
locked due to a billing issue." This is a fresh provider observation, not an
executed test failure. No billing change or CI retrigger was attempted.

Verify provider diagnosis: `gh api repos/mrnobodytx/buildanddo/check-runs/106513509603/annotations --jq '.[].message'`

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`  
Type A: 724; Type B: 1597; Type C: 163  
IOO compliance: complete; DKG orphans: 0  
All 159 prior events retained unchanged.

Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

## §5 CKET FILING

04_HYPOTHESIZE: existing upgrade spec.  
06_PLAN: existing sprint closure instructions.  
07_BUILD: existing acceptance runner.  
08_TEST: new runner regressions.  
11_COMMIT: dispatch, readiness contract/bindings, memory and this report/validation.  
CGRF: 4/4 new files have headers or a JSON sidecar.  
REFLEX: deferred to the receiving pipeline.

Verify reviewed source and inventory:

```bash
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. License posture unchanged. Restricted paths are
untouched; incremental secret-shaped-text checks found no credentials. There is
no payment/checkout change, deployment, shared database, remote mutation or
independent verification claim. Actor label requested: `actor:agent`; application
is not claimed. `verified:manual-review` applies while acceptance remains partial.

Rollback: revert the focused runner, regression and source-binding changes while
retaining observed evidence. The stricter invocation now requires a canonical
`acceptance-summary.json` filename and refuses existing output. No external state
needs reversal.

## §7 NEXT ACTIONS

Repository owner: restore GitHub Actions billing access. Its existing workflow
already installs the declared dependencies and provisions both native profiles.
IDE1 / acceptance operator: alternatively attach a provisioned runner with the
locked npm packages, declared Python dependencies and both actual binaries, then
run the documented eighteen-profile command on the selected candidate.

The existing four-gap handoff retains the receiving owners. No new external
message, issue, deployment or private task was dispatched. Runtime prerequisites
are the blocker; no additional platform or relaxed acceptance rule is proposed.
Source receipts/logs and the canonical export remain at the session-local paths
pinned in `acceptance-validation.json`; obtain fresh results if those bytes are
unavailable or the candidate changes. Independent qualification, deployed demo
proof and final submission remain outside this acceptance-only continuation.
