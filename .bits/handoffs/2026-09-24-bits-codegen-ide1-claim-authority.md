# --- CGRF Header ------------------------------------------------
# File:        .bits/handoffs/2026-09-24-bits-codegen-ide1-claim-authority.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     docs/claim-authority.md, docs/interactive-learning.md, .gitlab-ci.yml
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/claim-authority.md; CONSUMES docs/interactive-learning.md; CONSUMES .gitlab-ci.yml
# Intent:      Hand off actual native, rendered and production-configuration checks without granting operational authority from passing source tests.
# ----------------------------------------------------------------

# Claim authority receiving work

Origin: SRS-BUILDANDDO-UPGRADE-001 / VCC-BUILDANDDO-UPGRADE-001, CA-1 through CA-4.
Receiving owners: IDE1/backend, GitLab acceptance operator and private release owner.
This is a request for separately authorized receiving work, not a deployment dispatch.

## Immediate private review

The old Praxis client had a public URL fallback and deployment-file loading on
import. This source behavior is confirmed; the actual GitLab variable value and
any historical production pollution were not inspected here. The CI owner must
privately examine past destinations and records using existing audit/read tools.
Do not run the old selftests against a shared backend to find out. Do not bulk
delete suspected data or test accounts without an authorized provenance review.

The new GitLab job launches only fresh disposable loopback databases, for both
declared runtime profiles. The runner does not inherit deployment credentials,
shared PB targets or proxy configuration. Keep real service credentials on their
receiving hosts, not in the coding environment. The standalone service client now
requires explicit `PB_API_URL`; configure legitimate service callers explicitly.

## Installed acceptance

1. Provision the locked web dependencies and the two declared PocketBase test
   binaries. Run all existing acceptance profiles plus the blocking isolated
   Praxis job. A guard test or missing-binary BLOCKED result is not native proof.
2. Execute the expanded workspace fixture with and without request hooks. Confirm
   raw CRUD denial for the seven migrated collections under viewer, editor and
   admin identities, and then exercise each allowed scoped command separately.
3. Execute learning migration down/up, keyless responses, original-snapshot grading,
   raw-progress denial, canonical state pagination and retained legacy duplicates.
    Include the persisted answer wait and native method-valued field metadata.
    Confirm a revoked government enrollment does not prevent authorized public
   lesson entry, while aggregate completion remains unknown after a denied scan.
4. Run rendered form recovery, publication, seat-report attribution, certificate
    pagination and both case-study views. Test account/workspace changes and
    uncertain-response retries, including workspace round trips between recovery
    awaits and between transport confirmation and result acceptance. Confirm that
     logout clears pending private state. New browser reports must stamp the
     authenticated human account, reject alternate seat/actor labels and preserve
     exact retry identity. Source doubles do not execute the React lifecycle.

Install `1791500000_learning_progress_authority.js`,
`1791500001_workspace_claim_authority.js` and
`1791500002_authority_repair_lessons.js`, plus main's
`1791500100_tutorial_answer_wait.js`, with their matching hooks and frontend.
The new claims route depends on the existing administration audit/receipt schema.
An older frontend's raw writes and an older client's full-key learning response
contract are intentionally incompatible; use a coordinated rollout/maintenance
window, not permissive raw-write fallback. Preserve all recorded history.

Rollback retains the learning raw-write lock. Claim rollback removes its command
marker but keeps restrictive rules, revisions and stamps. Lesson rollback keeps
operator content and learner history. Do not reopen raw correction/revenue writes
or restore shared test targets as compensation. No money or external post is sent
by these commands, so no payment/provider compensation is fabricated.

## Remaining decisions

Mission assignment/follow-up flows, worker placement, epoch storage/publication,
claim-audit concurrency, password recovery, release atomicity, tracking consent,
runtime unification and the larger progression model are not resolved by this
source pass. Existing mission observations and independent TEVV reviews must be
preserved; a status transition is not authority to mint new verified evidence.

The public lesson at `/app/tutorials?lesson=test-isolation-and-claim-authority`
and source evidence at `/app/evidence` describe the actual source fixes. They
must not be imported as a learner achievement or a verified production outcome.

## PR 103 integration follow-up

The owner-requested main integration retains Buddi, public-lesson stripping and
the earlier claim/isolation repairs. Source checks do not replace either native
runtime or rendered acceptance. The authority source capture is now explicitly
pinned to its original tested revision; its output and observations are unchanged.

A read-only review also found an inherited full-assurance fixture mismatch:
`tests/assurance/runtime.py` omits the answer-wait migration, while
`tests/assurance/test_runtime.py` and `tests/assurance/browser.py` expect the
withheld learner-facing answer. Those files are unchanged in this integration.
The assurance owner must install the required schema and obtain expected answers
from authored test fixtures before that separate full-runtime lane can pass.
Do not reopen answer-bearing learner responses to satisfy the test harness.
