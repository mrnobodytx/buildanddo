# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/gitlab-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/out/VCC-BUILDANDDO-UPGRADE-001/gitlab-validation.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/gitlab-validation.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json; VERIFIED_BY tests/upgrade/test_gitlab_acceptance.py
# Intent:      Retain the GitLab correction and actual local acceptance limits so the next owner can act on evidence instead of the earlier GitHub assumption.
# ───────────────────────────────────────────────────────────────

# GitLab acceptance correction

GitLab executes CI. The previous GitHub billing observation remains historical
provider-specific evidence and is not a prerequisite for this execution lane.
The public acceptance fragment now runs one full eighteen-profile matrix,
checks governance through reachable GitLab jobs, isolates Python dependencies,
installs locked development tools even under NODE_ENV=production, and retains
all receipt/log/artifact bytes required by the shared validator. The submission
bundle explicitly receives the full job's artifacts and stays manual.

## §1 SUMMARY

Status: PARTIAL — source repair complete; runtime acceptance HOLD.
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm
Tasks: 3/3 local source tasks; runtime execution remains a receiving obligation.
Smoke: 4/18 acceptance profiles PASS; 3 FAIL, 1 HOLD, 10 BLOCKED.
Focused regressions: 74/74, zero skips.
CKS Gate: B+/75 target; CKS: pending; CAPS: pending; CK: pending.
Commits: 1 implementation (c177bf56bc16e8b80bca46f567534c43afe3c030); this report records that exact tested revision.
Reviewed source: `c123fe9cf39db9b0d001a5c9db9629b54802cbadd8564c4a23496cfd22fa4db4`.

Verify: `python scripts/ci/hostinger_readiness.py --check` and compare the
source identity in `gitlab-validation.json` with the current reviewed snapshot.
Evidence-only recording changes are separate from the tested implementation.

## §2 TASK RESULTS

- GL-1 PASS: the briefing inventories the GitLab root and reachable local includes.
  Both readiness gates require unsuppressed GitLab commands. GitHub-only wiring,
  comments, templates, optional/manual jobs and unresolved includes cannot satisfy
  those gates. Verify: `python -m unittest tests.upgrade.test_gitlab_acceptance -v`.
  Files: scripts/ci/gitlab_ci.py, scripts/ci/agent_context.py and both readiness
  validators. CKET: 11_COMMIT; regressions: 08_TEST.
- GL-2 source PASS: the configured full job selects all eighteen profiles and
  the downloaded artifact set revalidates with the real shared validator.
  Altering a downloaded log is rejected. Verify: `python -m unittest tests.upgrade.test_day21_acceptance -v`.
  Files: .gitlab/ci/day21-submission.yml, tools/day21/day21_acceptance.py,
  tests/upgrade/test_day21_acceptance.py. CKET: 11_COMMIT, 07_BUILD, 08_TEST.
- GL-3 source PASS: current context, milestone rationale, receiving owners and
  the contribution view now describe GitLab execution. Actual profile outcomes
  and all 19 receipts, including the first Node failure, remain recorded.
  Verify: `python scripts/ci/agent_context.py --check`, both readiness checks and
  `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.
  Files: governance/docs, contribution view, architecture generator and this
  report's validation/memory records. CKET: 04_HYPOTHESIZE, 06_PLAN, 07_BUILD, 11_COMMIT.

## §3 SMOKE TEST RESULTS

| Check/profile | Observed state |
|---|---|
| boundary | PASS |
| dependency_lock | PASS |
| native_classroom:compose | BLOCKED |
| native_classroom:package | BLOCKED |
| native_dossier:compose | BLOCKED |
| native_dossier:package | BLOCKED |
| native_learning:compose | BLOCKED |
| native_learning:package | BLOCKED |
| native_suite:compose | BLOCKED |
| native_suite:package | BLOCKED |
| native_workspace:compose | BLOCKED |
| native_workspace:package | BLOCKED |
| semantic_twin | PASS |
| source_node | PASS |
| source_python | HOLD |
| web_build | FAIL |
| web_lint | FAIL |
| web_tests | FAIL |

The exact commands, UTC times, source/candidate identity, test counts, exit codes,
receipt digests and log digests are retained in `gitlab-validation.json`.
The first full run returned HOLD with 3 PASS, 4 FAIL, 1 HOLD and 10 BLOCKED.
After the Node environment repair, only that failed profile was rerun; the shared
exporter revalidated the complete history to obtain the table above.

Observed source suites overlap and must not be summed: Node 510 passed; Python
740 cases, zero failures, six skips; semantic twin 122 passed. The focused set
passed 74 cases. New GitLab inspector executable-line coverage is 143/144 (99.31%);
acceptance runner coverage is 178/183 (97.27%). Coverage uses stdlib trace,
including import; it is not branch coverage. Ruff and strict mypy pass for the
changed typed CI modules and runner. Local YAML parsing, the exact Node-major
startup assertion and creation of the isolated Python/pip environment pass.

Failure diagnoses and applied corrections:

1. The initial provider regressions produced six failed assertions (including
   subtests) and two errors across seven test methods: GitLab was not inventoried
   and GitHub alone satisfied governance. Reachable literal GitLab configuration
   now drives both checks. The final 14 GitLab methods pass.
2. Split source/native jobs could not satisfy the full-matrix exit rule; summary-
   only artifacts omitted receipts/logs and the original build path. One full
   job now retains the complete export plus original JUnit/index paths. The
   download regression passes and rejects changed logs. During test construction,
   the downloaded fixture's runtime declarations also needed to match its source;
   that test setup was corrected without weakening runtime checks.
3. Manual rules initially slipped through the source inspector. Both direct
   `when` and rule-list manual entries are now excluded from required gates.
4. Node 22 initially ran 508 cases with one failing test file because the offline
   source diagnostic could not locate globally installed ESLint. Using the
   existing local ESLint 9.16.0 through NODE_PATH with Node 22 made its three
   focused cases and then all 510 Node cases pass. This limited diagnostic is
   distinct from locked repository lint, whose ESLint version is 9.39.4.
5. Web lint still lacks eslint-plugin-import, web tests lack Vitest and the build
   lacks concurrently. No locked frontend installation is present. Python retains
   six pypdf/Discord dependency skips. Both declared PocketBase binaries and
   cached images are absent, so all ten native profiles record BLOCKED.
   No network installation was attempted in this sandbox. The GitLab job is
   configured to provision these dependencies; its execution is unmeasured.

Runnable full-matrix command on a provisioned checkout:

```bash
python tools/day21/day21_acceptance.py --offline \
  --pocketbase-package /path/to/pocketbase-0.39.8 \
  --pocketbase-compose /path/to/pocketbase-0.28.4 \
  --evidence-dir state/day21/acceptance/new-run \
  --summary-output state/day21/evidence/new-run/acceptance-summary.json
```

The local run used Node 22.17.0 and the new isolated Python 3.12.13 interpreter,
with no supplied native binaries. The later Node retry set NODE_PATH to the
existing global diagnostic library. Neither synthetic regression receipts nor
that diagnostic supplies native, rendered or hosted acceptance. The original
GitLab job, wrapper and shared validator retain all eighteen requirements.

## §4 MEMORY INGEST

Type A count: 731
Type B count: 1617
Type C count: 166
IOO compliance: complete; DKG orphans: 0.
Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
All 163 events from the iteration baseline remain unchanged. Verify with the
existing dispatch memory validator; new events describe observed local work only.

## §5 CKET FILING

The new inspector is 11_COMMIT; its test is 08_TEST under this repository's
public application convention. These report/validation records are 11_COMMIT.
All new files carry CGRF headers or a JSON sidecar. Existing scope documents and
presentation retain their established stages. Verify with the memory validator.
REFLEX: deferred to the receiving private pipeline; no CK signatures computed.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. License posture: unchanged; no redistribution or
competition rights inferred. Public boundary and incremental restricted-path/secret checks
pass before handoff. No new private deployment controls, credentials or provider
activation are included. Existing root release jobs remain unchanged. Stripe:
not applicable; checkout code was not touched. Actor label: actor:agent required
on publication; application of a remote label was not performed in this session.

The CI reader is a deliberately bounded stdlib source inspector, not GitLab's
merged YAML compiler. It follows literal local includes and command lists, holds
on unresolved/unsafe/cyclic includes or duplicate job definitions, and does not
infer inherited/aliased scripts or evaluate rules. No GitLab API, hosted pipeline
or live deployment was queried or triggered. The current inventory exposes 22
unwired GitLab gates and two pre-existing unregistered specs; those findings are
separate from the eighteen-profile acceptance matrix and remain visible.

## §7 NEXT ACTIONS

The GitLab runner owner executes day21_full_acceptance for the selected candidate
with the declared Node version, Python venv/pip, locked npm/Python dependencies
and Docker or both declared PocketBase binaries. Retain state/day21/evidence/,
reports/junit/web.xml and dist/apps/web/index.html together. Missing dependency
or native evidence keeps runtime acceptance HOLD. GitHub billing is not a
prerequisite. The separate Cloudflare diagnostic belongs to the hosting owner.

Handoff: existing `.bits/handoffs/2026-09-21-bits-codegen-cmax-b-four-gap-closure.md`
now assigns GitLab execution to its receiving owner. No external notification
was sent. Suggested next dispatch: owner-issued GitLab execution/candidate
acceptance and follow-up on any actual failures; no dispatch ID is fabricated.
Independent qualification, deployed browser/product/replay proof, official rules
and final submission retain their previously documented receiving obligations.
Bugs filed externally: none; out-of-scope inventory findings remain in the briefing.
