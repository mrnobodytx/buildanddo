# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/test-assurance.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/assurance/run.py, tests/assurance/browser.py, tests/assurance/test_runtime.py, .gitlab/ci/source-validation.yml, docs/hostinger-sprint-closure.md
# EnumType:    Doc
# EnumEdges:   CONSUMES tests/assurance/run.py; CONSUMES tests/assurance/browser.py; CONSUMES tests/assurance/test_runtime.py; CONSUMES .gitlab/ci/source-validation.yml; EXTENDS docs/hostinger-sprint-closure.md
# Intent:      Make the eight requested test categories repeatable with explicit coverage limits and retained non-passing runtime prerequisites.
# ───────────────────────────────────────────────────────────────

# Eight-category assurance

`tests/assurance/run.py` adds a local assurance matrix beside the existing
eighteen-profile Day-21 acceptance contract. It does not replace any required
profile, manufacture frontend dependencies or count skipped tests as passes.
Its fixtures use disposable loopback PocketBase instances and synthetic accounts.
No shared backend, actual payment, hosted model or deployment is exercised.

| Profile | Executable behavior | Additional prerequisites |
|---|---|---|
| `journey` | Browser sign-in, objective setup/reload, saved lesson/checkpoints/practice/certificate, shared classroom; native mission execution, separate reviewer and reflection with browser readback; unpaid direct-route denial | PocketBase, locked Vite, Python Playwright, Chromium |
| `security` | Server membership/role/tenant boundaries, price and profile spoofing, expiry, revoked saved lessons, cached requests, sponsor/worker fences; native raw-API denial | Node for source; PocketBase for native |
| `evidence` | Exact decision/market export replay, stale/missing/foreign evidence, forged/rehashed approvals and summaries, revision linkage, independent polynomial arithmetic | Python stdlib |
| `failure` | Failed/timeout/malformed model actions retained; suite retry, lease, stale-policy and lost-response behavior | Python stdlib and Node |
| `accessibility` | Visible accessible names, document language/headings, image alternatives, keyboard dialog entry/trap/return and text at 200% | PocketBase, Vite, Playwright, Chromium |
| `compatibility` | Government, tutorial and classroom views in Chromium, Firefox and WebKit at 390 and 1,280 CSS pixels | PocketBase, Vite, Playwright and all three browsers |
| `load` | Sixteen concurrent completion/retry requests, one certificate/credit, duplicate joins, sustained read/heartbeat round trips and recorded latency | PocketBase |
| `recovery` | Offline fixture backup/restore preserves reviewed evidence, learning and permission denials; altered bytes or links reject restore | PocketBase |

The browser journey deliberately reuses the existing native API mission/review
scenario for its action segment. It is not yet a browser-only workflow authoring
and review test. Compatibility runs emulated viewport sizes, not physical mobile
hardware. Accessibility runs with reduced motion and checks specific naming,
focus and zoom behavior; it is not full WCAG or assistive-technology conformance.
Local load tests are bounded regressions, not a production capacity claim.

## Available source checks

```bash
python -m unittest tests.upgrade.test_assurance_runner tests.upgrade.test_research_sprint
python -m tests.assurance.run --source-only --profiles security,evidence,failure --output state/assurance/source-001
python tests/upgrade/check_federal_foundry.py
```

The last command retains per-module stdlib trace statement coverage, including
Decision Packages and the new federal-foundry modules, with the existing 80%
floor. It does not measure branch coverage. Source-only receipts explicitly mark
native/browser acceptance UNMEASURED. Source cases overlap the normal Node and
Python regression suites; do not add those totals together.

## Full local matrix

The receiving runner needs Node from `.nvmrc`, root `package-lock.json` packages
including development dependencies, Python 3.11+, `tests/assurance/requirements.txt`
and the corresponding Playwright browser executables/OS libraries. Supply a
disposable-test PocketBase binary, not a remote backend URL:

```bash
python -m tests.assurance.run --pocketbase /path/to/pocketbase --output state/assurance/full-001
```

With no binary/dependencies, the same command still runs available source checks
and records each affected profile BLOCKED. Exit 0 means all selected checks
passed with unchanged source; a partial matrix is HOLD/nonzero. A selected
subset cannot establish acceptance of omitted categories. Existing output
directories or symlinked paths are rejected.

The runner retains `summary.json`, exact command outcomes, counts, UTC times,
durations, logs and SHA-256 digests plus `source-binding.json`. Runtime identity
records the observed PocketBase version and executable digest; a provisioned
profile must match its declared version. Browser outputs
include actual case outcomes and screenshots on passing cases. All captured
browser HTTP traffic is limited to the local frontend and fixture backend.
Screenshots contain synthetic fixture data only. Empty, skipped and failed
runner results are non-passing; a source change during the run invalidates the
overall result. These receipts are consistency evidence, not signed attestations.

`BUILDANDDO_ASSURANCE_SOAK_SECONDS` sets a bounded 10–3,600-second fixture run
(default 60). `BUILDANDDO_ASSURANCE_LATENCY_BUDGET_MS` sets the read-plus-heartbeat
p95 regression budget (default 2,000 ms, maximum 30,000). Logs retain actual sample
count, median, p95, duration and selected budget. Choose workload/budgets before
measurement. A one-minute fixture cannot justify an uptime or scale claim.

Backup tests stop only their own fixture process. They hash and copy its complete
data tree, retain the post-backup tree during restoration and reject corrupted
or linked inputs before stopping a healthy instance. Production restore requires
the receiving operator's separate dispatch, backup mechanism, RPO/RTO and drill.

## GitLab jobs

`source_assurance` runs the recorder regressions, the three source profiles and
a research export/replay on Python 3.11 and 3.12 for reviewed changes. Submission
bundling waits for this required job as well as all prior jobs.

Set `BUILDANDDO_ASSURANCE_FULL=1` on the receiving GitLab pipeline to run
`assurance_full_runtime` for both existing PocketBase declarations (`package`
and `compose`). This explicit job installs locked frontend dependencies and
pinned Playwright into isolated job locations, and reuses the existing Day-21
Docker binary extractor. The runner owner must supply Docker, Node/Python and
browser OS libraries. Runtime provisioning failures are non-passing. Full
artifacts are retained for 30 days.

Hosted job execution is not inferred from this configuration. Inspect actual
candidate-bound exports before activating the government service. The original
Day-21 matrix still requires all eighteen profiles and its own deployment,
provider, independent-review and submission evidence.

## Remaining expansion

After the first provisioned run, triage actual failures and retain the baseline.
Extend the learner journey to all-browser mission authoring/review, add manual
assistive-technology and physical-device sessions, and size sustained multi-user
load against observed traffic. Production backup drills, real payment lifecycle
events and repeated authorized model episodes require their receiving owners.
The prior 60–90-scenario estimate was a planning budget, not a coverage target
that can establish readiness by counting tests.
