# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/product-framing-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     README.md, docs/submission-guide.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/product-framing-validation.json
# EnumType:    Doc
# EnumEdges:   CONSUMES README.md; CONSUMES docs/submission-guide.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/product-framing-validation.json
# Intent:      Explain the educational collaboration framing, its source checks and the remaining acceptance limits for reviewers.
# ───────────────────────────────────────────────────────────────

# Educational collaboration framing — validation report

## §1 SUMMARY

Status: PARTIAL — source implementation complete; frontend acceptance unavailable
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm
Tasks: 3/3 source tasks; rendered acceptance remains open
Smoke: 4/7 command gates pass; 3 frontend gates fail to start/complete
CKS Gate: B+/75 target; CKS: pending
CAPS: pending; CK: pending
Commits: 1 implementation at report capture (6703a37cc5c138c78dc9c42a93515f491db188a3)

The owner corrects the product identity to educational collaboration: objective,
learning, collaboration, real work, observation, verification, reflection and
reuse. Public pages, the README and evaluator materials now use that hierarchy.
Business operations remains an application domain with its existing tools,
paid-pilot offer and technical acceptance obligations.

Exact arguments, timestamps, exit codes and source/log SHA-256 digests are in
`product-framing-validation.json`. Short logs are retained in full; the large
Node log has an explicitly labelled excerpt plus its full-log digest and local
artifact path. Source tests ran before the implementation commit and match its
bytes. These are local checks, not a clean-candidate hosted acceptance export.

## §2 TASK RESULTS

### PF-1 — public identity and project intake

Status: source PASS; rendered acceptance unavailable.

The homepage presents lessons and shared practices before workspace metrics.
Its fourth metric reads saved challenges instead of revenue sources; support
and revenue still render with their original source/currency handling in the
business-project section. The challenge example is a shared project website.
Account/workspace isolation, challenge persistence and private-read gates are
unchanged. Existing rendered assertions check the scoped challenge count/link
and retain the USD/EUR/pending-payment assertions.

The shared FAQ/footer, early-access wording, pricing introduction and crawler
metadata describe educational collaboration. Early access adds learning,
software, research/proposal, community and creative categories alongside every
existing business option. It writes the same `business_type` and `task` text
fields; no migration or new API is introduced. Existing editorial layout,
onboarding, Twin/value views and commercial draft behavior are retained.

Files: apps/web/src/pages/HomePage.jsx, shared site/editorial/SEO components,
publicPages.js, HostingerChallengePage.jsx and its data, PricingPage.jsx,
generate-seo.mjs, generated llms.txt and affected existing rendered tests.
CKET: 07_BUILD / 08_TEST / 11_COMMIT as declared by the existing sources.

Verify:

```bash
node --test tests/upgrade/build.test.mjs tests/upgrade/workspace-summary.test.mjs
npm --prefix apps/web test -- src/pages/__tests__/HomePage.test.jsx src/__tests__/HostingerChallengePage.test.jsx
```

The Node cases passed within the full 580-case run. The npm command requires
the missing locked Vitest installation; it was not a successful rendered run.

### PF-2 — evaluator story and product hierarchy

Status: PASS for source/document review.

The README, judge story and video plan lead with “Learn by doing. Verify what
you did. Do it together.” Classes, tutorials, practices, missions, evidence,
replay and capability/progress are core. The guide follows a saved objective
through a lesson, collaboration, bounded work, review and reflection. The
existing ERP/provider lane remains a domain demonstration with its native,
provider, independent-review and same-candidate gates. Recording plans never
assert that a learner or provider already completed them.

Files: README.md, docs/submission-guide.md, docs/sprint-user-journey.md,
docs/hostinger-sprint-closure.md, docs/day21/JUDGE_STORY.md,
docs/day21/VIDEO_SHOTLIST.md and the existing dispatch/readiness context.
CKET: 06_PLAN / 04_HYPOTHESIZE / 11_COMMIT.

Verify: inspect those documents and run
`python scripts/ci/hostinger_readiness.py --check` and
`python scripts/ci/submission_readiness.py --check`.
The source comparison retained all eleven checkpoint check lists, dependencies,
runtime requirements, prior acceptance conditions and external requirements.
The refreshed binding acknowledges reviewed source, not operational completion.

### PF-3 — validation and preserved history

Status: source PASS; overall acceptance PARTIAL.

All 580 Node regressions pass with Node 22.17.0. Python 3.12.13 discovers 802
cases: 770 passed, 32 skipped, no failures. The global ESLint 9.16.0 source
diagnostic under Node 24.13.0 parses 340 modules with zero errors; it is neither
repository lint nor rendered execution. All 192 pre-existing Type C events
remain unchanged. No new test module or coverage claim was added for copy.

Files: product-framing-validation.json, this report, memory.json and source locks.
CKET: 11_COMMIT.

Verify: the commands below and
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## §3 SMOKE TEST RESULTS

| Gate command | Expected | Actual | Result |
|---|---|---|---|
| `npm --prefix apps/web test` | Rendered suite executes | `vitest: not found`, exit 127 | FAIL — dependency unavailable |
| `npm --prefix apps/web run lint` | Locked lint executes | Missing `eslint-plugin-import`, exit 2 | FAIL — dependency unavailable |
| `npm --prefix apps/web run build` | Frontend bundle | Node 22 reaches missing Vite, exit 1 | FAIL — dependency unavailable |
| `node --test tests/upgrade/*.test.mjs` | No failing source cases | 580 passed, no skips | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | No failing source cases | 770 passed, 32 skipped | PASS with native/optional gaps |
| `python scripts/ci/agent_context.py --check` | Current lock | 24 existing findings, 22 unwired gates; lock matches | PASS |
| `python scripts/ci/verify_public_boundary.py` | No boundary violations | No failures | PASS |

Failure diagnosis: the initial Node 24 build hit the shell sandbox's subprocess
restriction while resolving Git identity. Retrying with approved local process
permissions and the declared Node 22 runtime resolved that restriction. It then
reached the missing Vite binary. Vitest and the repository lint plugin are also
absent. No source workaround, dependency substitution or reduced gate was applied.
The prior offline-cache failure remains historical; no installation was retried.
Provision the existing locked dependencies in the receiving environment and
rerun the three unchanged npm commands above.

Readiness, submission policy, source diagnostics and memory checks also pass.
Native PocketBase, browser recording, real provider effects and hosted GitLab
acceptance were not run for this presentation change. The full Day-21 matrix
was not rerun. Earlier live/fixture observations were not relabelled as current.

## §4 MEMORY INGEST

Type A count: 790
Type B count: 1791
Type C count: 196
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json

All 192 prior Type C events are preserved verbatim. Current file metadata and
declared edges are refreshed; the new observations describe the actual tests,
missing frontend dependencies and implementation record. CK/CAPS stay pending.

## §5 CKET FILING

06_PLAN: README and existing submission, sprint, judge and video documentation.
04_HYPOTHESIZE: existing SRS/context and source binding.
07_BUILD / 08_TEST: existing frontend, generated catalogue and rendering tests.
11_COMMIT: existing dispatch/memory plus this report, validation and its sidecar.
13_SAVE: none.
CGRF headers: 3/3 new files represented by a header or JSON sidecar.
Existing Day-21 author/dispatch provenance is retained while adding this
continuation's required file, relationship and dispatch metadata.
REFLEX check: deferred to the existing post-merge owner.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc.
License posture: unchanged; README's existing proprietary posture applies.
Authority: registered A2 public source only; actor:agent required.
Boundary scan: PASS; actor label is not remotely measured by this local run.
Secret handling: no credentials read or added; public-boundary scan has no failures.
Stripe mode: not applicable; no checkout code changed.
Runtime evidence: unmeasured for this task; no seat event, deployment, provider
effect, earned capability or economic outcome is asserted.

## §7 NEXT ACTIONS

Provision locked frontend dependencies and execute the rendered homepage,
challenge and early-access experience, lint and build. Capture one actual
learner/project journey and its reflection on the accepted candidate using the
existing Day-21 acceptance and receiving activation contract. Native, provider,
independent-review and owner submission obligations remain open.

Handoffs requested: none new; the existing Day-21 activation handoff remains
authoritative for runtime and submission work. Suggested next dispatch: none
invented. Deadline, judging weights and product-use statements were not newly
authenticated against official rules by this task. No remote issue or PR
comments were posted from the read-only source-control interface.
