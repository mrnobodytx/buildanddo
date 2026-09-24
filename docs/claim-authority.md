# --- CGRF Header ------------------------------------------------
# File:        docs/claim-authority.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     apps/pocketbase/pb_hooks/workspace-claims.js, apps/pocketbase/pb_hooks/tutorial-learning.js, services/praxis_evidence/run_all_tests.py
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-claims.js; CONSUMES apps/pocketbase/pb_hooks/tutorial-learning.js; CONSUMES services/praxis_evidence/run_all_tests.py
# Intent:      Describe the repaired test and claim authority boundaries without manufacturing provider evidence, mastery or production acceptance.
# ----------------------------------------------------------------

# Test isolation and claim authority

This source continuation closes the highest-risk reported test and write paths.
It does not implement every item from the wider mission/progression review.
Native authentication, current workspace roles and existing independent-review
owners remain authoritative. A stored report is not automatically a verified fact.

## Isolated Praxis tests

`services/praxis_evidence/run_all_tests.py` owns a new temporary database and
loopback PocketBase process for each selftest. Only the public Praxis schema,
synthetic fixture administrator and fixture-identity hook are installed. All data,
including accounts or pilot records a suite does not clean up, is discarded when
the process exits. Shared `PB_API_URL`, superuser credentials, proxies and
deployment files are not passed into children. The service client has no default
public write target and performs no deployment-file reads on import.

The selftest client checks literal loopback, runner process/lifetime, a matching
local context and the server's fixture identity before authentication and writes.
Redirects are fatal, including malformed redirects; they must never count as an
expected application rejection. The runner checks exit status and an unambiguous
nonempty all-passed summary. Missing binaries and partial results cannot pass.
These checks prevent accidental shared-backend tests; they are not a sandbox
against an operator intentionally modifying the runner or test source.

GitLab retains a blocking Praxis job for both `package` and `compose` profiles.
Its explicit `--provision` option uses the existing disposable-binary helper.
Locally, supply an already installed declared binary; `--suite selftest.py` can
select a single suite without bypassing isolation. No native execution or
production variable inspection is established by source-unit tests.

## Locked reports and editorial commands

Install `1791500001_workspace_claim_authority.js` with `workspace-claims.js`,
`workspace-claims.pb.js`, their existing access/business validators and the
matching frontend. Ordinary raw create/update/delete is denied for all seven
collections even without request hooks. Scoped reads and historical data remain.
An absent backend command means unavailable, never a fallback to raw writes.

| Collection | Current write authority and meaning |
|---|---|
| `support_sources` | Owner/admin connection request only. No browser-supplied financial, health or sync observations, including from admins. |
| `corrections` | Author comparison in pending state; author/admin edits. No verification promotion until an actual review owner is bound. |
| `daily_editions` | Author/admin drafts; administrator publishes the saved revision with server-owned actor/time. Published history is retained. |
| `specialist_desks` | Author/admin operator bookkeeping, not evidence that an agent executed or received authority. |
| `social_content` | Author/admin draft edits with the existing separate administrator approval/publication policy and exact review fields. |
| `social_channels` | Administrator connection requests, not provider delivery or health facts. |
| `seat_events` | Append-only reports stamped with the actual submitting account. Seat and actor-type labels remain claims. |

The POST command body contains `action`, `revision`, `request_key` and `payload`.
Supported actions are `support.request`, `correction.save`, `edition.save`,
`edition.publish`, `desk.save`, `content.save`, `channel.request` and `seat.report`.
Authorship, workspace, revisions, review stamps and provider facts are not
editable values. Writes and existing audit/retry receipts share a transaction.
Authority/readability are checked before replay; a revoked account cannot recover
an old receipt as present authority. Uncertain writes retain their original
bytes/key, including before a subsequent distinct seat report.

The seat publisher retains up to 32 unresolved workspace requests within the
current account session, without evicting old keys. Returning to a workspace
reuses its request; responses and recovery chains remain bound to their original
visit. Transport success is acknowledged only after the publisher accepts it.
Logout or account changes clear this private memory. This is not a durable queue
across a tab reload; inspect recorded reports before issuing a replacement.

Legacy revenue, connection, correction and seat labels are preserved as reports,
not newly authenticated provider results or agent identity. There is no installed
payment ingestor in this pass, so no provider-confirmed revenue is shown. A seat's
reported completion is not an independently verified outcome or an operational
grant. Old publications without server attribution are historical labels, not
new publisher attestations. No migration backfills provenance.

The down migration removes the command marker while retaining restrictive rules,
revisions, stamps and history. Do not restore permissive raw writes as rollback.
The learning lock at `1791500000_learning_progress_authority.js` similarly retains
owner-readable reading history and denies new manual completion writes. Guided
states and frozen certificates remain separate; see `docs/interactive-learning.md`.

## Site lesson and evidence

`/app/tutorials?lesson=test-isolation-and-claim-authority` teaches the failures,
repairs, negative controls and open-book limitations. The matching
`1791500002_authority_repair_lessons.js` installs its canonical lesson without
overwriting operator edits, progress or enrolled snapshots. The bundled preview
does not fabricate a backend identity or save learner progress.

`/app/evidence` contains a separate Source case studies section, not additional
workspace evidence rows. Actual dated source results and their limited scopes
belong there; no test artifact grants XP, certificates, payment provenance or
independent verification. The earlier broadcast capture keeps its original
bytes/digests and is validated against its historical source revision.

## Corrected findings and follow-ups

Missions already generate scoped observations through business actions, workflow
decisions and suite attachments. Verifying a mission freezes selected evidence;
it must not mint new independent evidence merely from the status label. Existing
social approval/publication was already admin-only; cross-author draft editing
and raw-rule fail-open behavior were the additional gaps closed here.

Still separate work: mission assignment and follow-ups; worker hosting; durable
epoch publication/retention and claim-audit concurrency; password recovery;
release atomicity and provider diagnostics; tracking consent; a unified
progression model and runtime-version selection. Those reports were not all
reproduced in this bounded repair and are not asserted resolved. Private owners
must inspect actual CI targets and release configuration under their authority.

Before rollout, execute both declared native profiles, including deliberately
hookless raw-write denials, concurrency, restart and rollback, plus rendered
learning/editorial flows on the exact candidate. Source doubles, merged code and
a refreshed governance binding cannot establish that acceptance.
