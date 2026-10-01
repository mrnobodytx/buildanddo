# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-MAIL-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-MAIL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-MAIL-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-25
# Depends:     apps/pocketbase/pb_hooks/builder-mailer.pb.js
# EnumType:    Doc
# EnumEdges:   GATES c-one/SRS-BUILDANDDO-MAIL-001-* branches; DEPENDS_ON apps/pocketbase/pb_hooks/builder-mailer.pb.js
# DAG Node:    none
# Intent:      Make account mail (password reset, verification) deliverable on staging and production through Customer.io.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-MAIL-001 — Account mail through Customer.io

**Status:** in_progress **Risk:** A2 **Seat:** C-ONE

**Authorization:** the operator decided on 2026-09-25 that BuildAndDo mail goes through
Customer.io, after the Hostinger mail API turned out to manage mailboxes but not send.
Recorded here before implementation.

## Problem

Measured read-only on 2026-09-25 on both environments: PocketBase SMTP is disabled, the
builder mailer URL is unset and the sender is the placeholder `support@example.com`. Every
account mail is therefore posted to `undefined/api/v2/email` and fails. No password-reset or
verification mail can reach anyone on staging or production.

## Scope

1. `builder-mailer.pb.js` gains a Customer.io branch behind `BUILDER_MAILER_PROVIDER=customerio`.
   PocketBase SMTP still wins when enabled; without the switch the builder mailer path is unchanged.
2. `customerio-mail.js` sends the message PocketBase rendered to the transactional API
   (`/v1/send/email`, US or EU host) with `tracked: false`, `disable_message_retention: true` and
   `send_to_unsubscribed: true`, one recipient per message.
3. Bad configuration refuses before any request is made. Log lines carry a reason, a status and a
   scrubbed detail, never an address, a link or the key.
4. A native check, `native_mail`, runs a real PocketBase 0.39.8 password reset against a loopback
   fake and then uses the delivered link.

## Out of scope

Setting any host configuration or secret; a live send; adding buildanddo.com as a Customer.io
sending domain; moving BuildAndDo to its own Customer.io workspace.

## Invariants (security)

- No secret value is written to the repository, a log line, an API response or a test fixture.
  Configuration is referenced by variable name only.
- The mail provider never tracks or retains a reset link.
- A reset request never reveals whether an address is registered or whether delivery failed.

## Acceptance

1. `node --test tests/upgrade/mail-delivery.test.mjs` passes, and each of six mutants fails it:
   tracking on, retention on, an unscrubbed refusal detail, sending to the first of several
   recipients, a misspelt switch, and the default mailer also running.
2. `python tests/upgrade/test_mail_native.py --require-binary` passes on PocketBase 0.39.8,
   including both controls: an unknown address, and the switch turned off.
3. `python scripts/ci/hostinger_readiness.py --check` and `python scripts/ci/agent_context.py --check` pass.

## Known limits

- Customer.io creates a person for each new recipient, in the workspace that owns the key, so a
  broadcast to everyone in that workspace would include BuildAndDo members. Check the workspace's
  campaigns before enabling the switch; a dedicated BuildAndDo workspace and key remove this.
- The sender must be verified in that workspace. A buildanddo.com sender needs the domain
  verified in Customer.io first.
