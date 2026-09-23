# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/learning-loop-acceptance-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/ci/hostinger_checks.py, tools/day21/day21_public_probe.py, tools/day21/day21_browser_capture.py, tests/upgrade/workspace-assistant.test.mjs, tests/upgrade/career-profile.test.mjs, .bits/handoffs/2026-09-22-bits-codegen-cmax-b-day21-activation.md
# EnumType:    Doc
# EnumEdges:   CONSUMES scripts/ci/hostinger_checks.py; CONSUMES tools/day21/day21_public_probe.py; CONSUMES tools/day21/day21_browser_capture.py; VERIFIED_BY tests/upgrade/workspace-assistant.test.mjs; VERIFIED_BY tests/upgrade/career-profile.test.mjs; CONSUMES .bits/handoffs/2026-09-22-bits-codegen-cmax-b-day21-activation.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain the connected-loop repairs and actual local limits without treating source tests as deployed acceptance.
# ----------------------------------------------------------------

# Connected learning-loop acceptance

## 1. Summary

Status: PARTIAL. Local integration and acceptance tooling repaired; rendered,
native, hosted, Citadel-service and deployment acceptance are not established.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. CKS, CAPS and CK: pending.

The current direction is to join and validate the existing objective-to-evidence
loop before expanding the product. This continuation adds no standalone feature
module, canonical store, private runtime or deployment authority.

## 2. Task results

- LC-1: GitHub check 106999882933 on PR 74 failed before executing any step. Its
  annotation reports an account billing lock. Cloudflare check 107000042333
  separately failed without an error annotation. Neither diagnoses GitLab health.
- LC-2: The source Python acceptance selection now includes career, Knowledge
  Unit, integrity and world-twin tests. All four existing coverage gates are
  required in GitLab on Python 3.11 and 3.12; submission waits for both matrix
  members. Empty suites block acceptance. Test bytes now enter the source binding.
- LC-3: Public/browser capture producers retain response bytes, screenshots,
  console evidence and actual deployed-version readbacks accepted by the unchanged
  submission validators. Candidate mismatches and console errors fail. Expected
  source/artifact digests are not misrepresented as remote artifact attestations.
- LC-4: Journey and Career routes are admitted by the existing assistant policy,
  with native role and human-approval checks retained. Career reads use request
  generations and session disposal. Journey drafts survive a lesson round-trip
  only in the current in-memory workspace; unconfirmed saves cannot blindly
  retry. Home activity links open exact records, and evidence labels no longer
  inflate verified-outcome totals. Reviewed work remains in the existing scoped
  operator/value projection.
- LC-5: Receiving commands and ownership are recorded in the existing activation
  handoff and Day-21 runbook. Full acceptance is retained separately for the frozen
  candidate, rather than retroactively assigning live status to these source tests.

## 3. Validation

Observed red/green evidence:

- Three connected Node regressions initially failed: the journey route was
  rejected; an older same-account profile read won; and an old profile session
  returned after disposal/account return. All three now pass.
- Producer tests initially exposed two missing-field errors and one false-success
  exit with console errors. The updated producer/validator tests pass with
  explicitly synthetic HTTP and Playwright doubles; no remote probe was run.
- 125 existing and extended governance/acceptance tests pass under Python 3.12.
- The four portable gates also pass under both installed Python 3.11.15 and
  3.12.13: 75 career, 7 Knowledge Unit, 13 integrity and 7 world-twin cases per
  interpreter, with at least 96.74 percent statement coverage per measured module.
- 38 focused Node route/client/compiler/value cases pass on Node 22.17.0. The
  compiler exercises 180 answer combinations; earlier prose said 90 incorrectly.
- Broad Node execution initially had 632 passes and one diagnostic-loader failure
  because Node 22's global npm directory had no ESLint. Reusing the installed
  ESLint via an explicit local npm prefix makes all three checker regressions
  pass. This offline source diagnostic parses 353 modules with zero errors; it
  does not substitute for repository lint, rendered tests or a build.
- Ruff passes for changed Python files. Strict typing passes for the changed
  production Python modules and the GitLab/capture tests. The broader legacy
  readiness-test typing run retains six existing typing errors; no test was
  excluded from behavior acceptance to conceal them.
- Locked `npm ci --offline --include=dev --ignore-scripts --no-audit --no-fund`
  fails ENOTCACHED for zod. The requested Vitest suites cannot start (`vitest: not
  found`). Added rendered journey, profile and home regressions remain unexecuted.

Run the full unchanged eighteen-profile matrix only after freezing the source:

```bash
python tools/day21/day21_acceptance.py --repo . --offline \
  --evidence-dir state/day21/acceptance/learning-loop-20260923-001 \
  --summary-output state/day21/evidence/learning-loop-20260923-001/acceptance-summary.json
```

Use the installed Node 22 runtime for that command. The local source diagnostic
can resolve the already installed global ESLint through its npm prefix; the
locked frontend gates must still fail if their own dependencies are missing.
Missing native binaries produce current BLOCKED receipts for both profiles. The
generated receipt/log/artifact directory is ignored operational evidence, not a
public source assertion. Its recorded candidate and source digest identify what
was actually checked. A later source change requires a new run directory.

## 4. Memory

The existing dispatch payload keeps all 214 prior Type C events unchanged.
Current file metadata and declared edges are regenerated; new events retain the
observed red/green checks and unavailable frontend validation. Counts are in
the payload's summary. Verify with the existing dispatch `verify.py`.

## 5. Filing

Implementation stays in existing source, tests and acceptance producers.
The report is filed at stage 11_COMMIT. The receiving runbook remains stage
06_PLAN. New synthetic cases are tests, not independent or deployed evidence.
REFLEX and CK remain receiving/post-merge concerns.

## 6. Governance

Citadel Nexus Inc. remains the owner. Existing gates, the public/private
boundary and exactly-one-actor-label rule are retained. No remote pipeline was
triggered, account setting changed, secret read, deployment made, provider
activated or external seat event fabricated. Source review refresh records only
review of the changed bytes; it cannot complete a milestone.

## 7. Next actions

The account owner resolves the GitHub billing lock. The CI/release owner obtains
the independent Cloudflare diagnostic and runs required GitLab jobs on the same
candidate, retaining both Python coverage artifacts and all eighteen profiles.
IDE1 supplies both native PocketBase runtimes and the locked frontend/browser
toolchain. The Citadel owner supplies the approved profile/inference service.
The authorized staging operator then captures one clean-browser journey, actual
provider effects, distinct review, replay and release/artifact readback.

The full semantic home, Knowledge Unit/KBOM web surface and canonical world-event
integration remain subsequent product work. Neither local hash chains nor
caller-supplied reviewer names alone authenticate evidence or justify promotion.
