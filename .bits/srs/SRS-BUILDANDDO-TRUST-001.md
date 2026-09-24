# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-TRUST-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-TRUST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRUST-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     AGENTS.md, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_hooks/workspace-record-policy.js, scripts/deploy/ship.py
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-TRUST-001-* branches; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-record-policy.js
# DAG Node:    none
# Intent:      Make earned progress, shared records and the deploy path trustworthy before the website-to-credential loop is built on them.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-TRUST-001 — Trust hardening before the build loop

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

**Authorization:** the repository owner asked on 2026-09-23 for the stage-one trust
fixes from the 2026-09-23 progression, community and operations reviews, with the
instruction that no secrets may be exposed. Recorded here before implementation.

## Problem

Read-only reviews on 2026-09-23 found that progress and shared records can be
asserted from the browser, and that two operational paths can damage production:

- The tutorial lesson detail returns `lesson.check.answer` to the browser, and
  answers can be retried without limit, so a certificate needs no learning.
- `tutorial_progress` is owner-writable and never checked against a certificate.
- Any author can create a correction as `verified`; any editor can rewrite another
  member's correction, Daily Edition, specialist desk or social content, and
  publish a Daily Edition without an admin.
- `support_sources` revenue fields (`gross`, `refunds`, `payout_status`, `status`)
  are editor-writable and shown as synced revenue.
- `seat_events.actor_type` and `seat` are set by the client.
- The Praxis GitLab job falls back to the production PocketBase URL.
- `ship.py` empties the live directory before copying and disables SSH host-key
  checking.
- Password-reset emails use a hard-coded preview host, the site has no reset
  confirmation page, and every reset error is reported as success.

## Scope

1. Tutorial anti-cheat: never send the correct answer before a correct attempt;
   bound wrong attempts with a server-enforced wait.
2. Server-owned progress: interactive-lesson completion in `tutorial_progress`
   requires the matching server-issued certificate.
3. Shared-record permissions: corrections `verified` only by an owner or admin;
   editors change only their own corrections, desks and social content; publishing
   a Daily Edition needs an owner or admin.
4. Server-owned revenue fields: clients may only request a connection
   (`status: pending`); synced figures are server-only.
5. Seat events: the server stamps the acting account; `actor_type` and `seat`
   must match what that account may speak for.
6. Praxis tests fail closed without an explicit, non-production `PB_API_URL`.
7. `ship.py`: copy to a staging directory, then swap atomically and keep the
   previous release for rollback; accept only known or first-seen host keys.
8. Password reset: the app URL comes from configuration, a reset confirmation
   page exists, and transport or rate-limit failures are reported honestly
   without revealing whether an address is registered.

## Out of scope

Website import, workers, workflow fixes and credentials (later stages); running a
deploy; setting any secret or configuration value on a host.

## Invariants (security)

- No secret value is written to the repository, a log line, an API response or a
  test fixture. Configuration is referenced by variable name only.
- A missing or unsafe configuration fails closed with a plain message; it never
  falls back to a production target.
- Every rule is enforced on the server; the browser's checks only shape the UI.
- Rejections do not reveal whether an email address or record exists.

## Acceptance

1. A lesson detail response contains no answer before a correct attempt, and a
   wrong attempt inside the wait window is refused.
2. A client write marking an interactive lesson completed without a certificate
   is refused; reading lessons are unchanged.
3. Corrections, editions, desks, social content, revenue fields and seat events
   reject the forbidden writes above, with tests.
4. `run_all_tests.py` refuses to run without a non-production `PB_API_URL`.
5. `ship.py` never deletes the live directory before a complete copy exists, and
   no longer passes `StrictHostKeyChecking=no`.
6. The reset flow links to a page in the app, and honest errors are shown.
7. Node upgrade tests, affected Vitest suites, lint, build, the boundary check and
   a secret scan of the diff pass.

## Verification

`node --test tests/upgrade/*.test.mjs`, affected `npx vitest run` suites,
`npm run lint`, `npm run build`, `python scripts/ci/verify_public_boundary.py`,
`python scripts/ci/agent_context.py --check`, `python scripts/ci/hostinger_readiness.py --check`,
and a secret-pattern scan of `git diff origin/main`.
