# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SENTRY-GUILD-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     AGENTS.md, scripts/ci/verify_public_boundary.py
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-SENTRY-GUILD-001-* branches; DEPENDS_ON scripts/ci/verify_public_boundary.py
# DAG Node:    none
# Intent:      Scope Sentry to the public BuildAndDo plane as its own guild so its credits buy self-healing and verified lessons without exposing private-plane IP.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SENTRY-GUILD-001 — Sentry guild, slice 1

**Status:** in_progress **Risk:** A1 **Seat:** C-ONE

**Authorization:** on 2026-10-16 the repository owner accepted Sentry for Startups
($5,000 credit, org `citadel-nexus`) and directed that Sentry be isolated as its own guild
serving primarily BuildAndDo, without giving Sentry access to how the private system
works. This slice is the additive A1 part an agent seat may self-authorize.

## Problem

Sentry's value is Seer: root cause, solution and a draft pull request for an error. That
value requires Sentry to see code and error context. The private CNWB plane must not be
visible to it. BuildAndDo is already the public collaboration plane, guarded by
`verify_public_boundary`, so scoping Sentry to BuildAndDo costs no IP. Nothing yet
enforces that scope at the event level, nothing captures Seer's analysis as reusable
knowledge, and nothing checks that a fix actually worked.

## Scope

Add dependency-free `apps/sentry_guild/`:

- **Scope guard and scrubbing (`scrub.py`).** A `before_send` hook that drops any event
  touching private-plane markers or in-app code outside BuildAndDo's roots, and strips
  source context, local variables, request data, user identity and secret-looking text
  from everything else. Recommended SDK options are declared alongside.
- **Seer intake (`seer.py`).** Constant-time HMAC check of `Sentry-Hook-Signature`;
  parsing of the seven Seer actions; folding deliveries into one run per `run_id` whose
  stage never moves backwards.
- **Lessons (`lessons.py`).** A code-free lesson per run: symptom, cause, why-chain and fix
  steps with code, paths, URLs and secrets removed. Labelled INFERRED; promoted to VERIFIED
  only with a RECOVERED verdict and an evidence reference.
- **Verification (`verify.py`).** Before/after metric points (for example a Datadog error
  or latency query) decide RECOVERED, NOT_RECOVERED or INSUFFICIENT_DATA.
- **Handoff (`handoff.py`).** Open handoff per run: Seer produces, Sentinel triages,
  Oracle and the metric verify, a human closes.
- **CLI.** `python -m apps.sentry_guild scrub|runs|verify` over local JSON.

## Out of scope

- Installing the Sentry SDK in `apps/web` or any existing app, and any DSN (A2/A3).
- The webhook HTTP endpoint, NATS, PocketBase and scheduled jobs (A2).
- Writing lessons into the private memory store, Datadog queries and any network call
  (A3: external write, secret access).
- Connecting any private repository to Sentry or Seer (prohibited by this spec).

## Invariants

- An event that references the private plane is dropped whole, never partially sent.
- Scrubbed events carry no source lines, local variables, request bodies or user identity.
- A lesson contains no code span, file path, URL or secret-looking string.
- A lesson is VERIFIED only with a RECOVERED verdict and an evidence reference.
- The producer (Seer) never verifies; a handoff is never closed by the system.
- Seer never merges; its pull requests pass BuildAndDo's gates like any other.

## Acceptance

`python tests/sentry_guild/check_sentry_guild.py` passes with every module at or above
80 percent statement coverage; `verify_public_boundary`, `agent_context --check`,
`hostinger_readiness --check` and `submission_readiness --check` pass.
