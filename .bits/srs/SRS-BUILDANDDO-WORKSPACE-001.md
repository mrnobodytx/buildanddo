# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-WORKSPACE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-WORKSPACE-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
#              apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/web/src/pages/workspace;
#              DEPENDS_ON apps/pocketbase/pb_migrations;
#              PRODUCES datadog.rum.action
# Intent:      Specify the working data layer and interactions the workspace pages
#              need before staging can show anything other than an empty shell.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-WORKSPACE-001 — Functional workspace pages

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The seven core workspace pages render a list and a create dialog and stop there.
Concretely, before this change:

- A mission could be created and stepped forward one stage at a time. It could
  not be edited, deleted, prioritised, or given a due date or a progress value,
  and the list could not be filtered or sorted. A workspace with twenty missions
  was unusable.
- A workflow had a name, a description and a three-value status. It had no
  steps, so "workflow" described an intention rather than a sequence, and
  activating one recorded nothing about what would run.
- Operations showed connection cards for self-hosted services. There was no
  runbook, no operation, and no execution log — the page named in the product as
  the operational surface could not describe a single operation.
- Evidence was a flat reverse-chronological list with no title, no link, no
  category and no search. Past about thirty entries it stopped being a ledger
  and became a wall.
- Signals could be recorded but never triaged. There was no severity, and no way
  to acknowledge or dismiss one, so the feed only ever grew.
- The Daily Edition was a manual editor with no view of the day it summarised.
- The Front Page counted records but showed no activity across collections and
  no health of the data layer itself.

Underneath all seven, `useWorkspaceRecords` was read-only: every page reimplemented
its own create call, its own saving flag, and its own error string, and a failed
write surfaced as a bare console error. A backend outage produced a page of empty
states indistinguishable from a genuinely empty workspace — the single most
misleading state this product can show, because "nothing happened" and "we cannot
tell you what happened" mean opposite things to an operator.

## Intent

Make the workspace pages usable against a real backend, and make the difference
between *empty*, *degraded* and *demonstration* impossible to miss.

## Scope

- Extend the existing PocketBase collections in place (missions, workflows,
  signals, evidence) with the fields the interactions above require, and add
  `operations` and `operation_runs` for the runbook surface. One additive,
  reversible migration; no field is `required`, so existing rows stay valid.
- Give `useWorkspaceRecords` create / update / remove operations with a single
  error surface, and a `degraded` flag distinguishing a failed read from an
  empty collection.
- Add an explicit, opt-in demonstration dataset. It is never a silent fallback:
  the operator turns it on, every page carries a banner while it is on, and no
  write reaches PocketBase in that mode.
- Wire Datadog RUM custom actions for the interactions a product owner would ask
  about — mission created, workflow started, signal acknowledged, operation run,
  evidence recorded, edition published.
- Wrap each page in an error boundary so one failing page cannot blank the shell.

## Out of scope

- Automated tests. `apps/web` has no test runner; SRS-BUILDANDDO-TEST-001 adds
  one, and this SRS deliberately does not pull that decision forward.
- Executing anything. Activating a workflow or logging an operation run records
  intent and outcome; BuildAndDo still does not run automations itself.
- Real-time subscriptions. Signals refresh on demand, not over a socket.

## Invariant this change must not break

**BuildAndDo does not invent business activity.** The demonstration dataset is
the one exception and it is fenced: opt-in, banner-marked on every page, stored
in `sessionStorage` so it dies with the tab, and read-only. An operator must
never be able to mistake a demonstration record for one of their own, and an
empty workspace must keep looking empty.

## Acceptance evidence

Each claim below carries the command or observation that produces its evidence.

1. Migration is additive and reversible.
   `node --check apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js`
   and inspection: every `fields.add` is guarded by `getByName`, every new
   collection creation is guarded by a `findCollectionByNameOrId` try, and the
   down migration removes exactly what the up migration added.
2. Every changed source file parses as JSX.
   `bun build <file> --no-bundle --outdir /tmp/check` for each changed file
   under `apps/web/src`.
3. Demonstration mode cannot write.
   Inspection of `apps/web/src/lib/demoWorkspace.js` and the mutation path in
   `useWorkspaceRecords`: `create`, `update` and `remove` return a
   `demo_mode_read_only` result before any `pb.collection(...)` call.
4. Degraded reads are distinguishable from empty ones.
   `useWorkspaceRecords` returns `degraded: true` only after a rejected request;
   each page renders the degraded banner instead of the empty state in that case.
5. RUM actions fire on the named interactions.
   `grep -rn "trackWorkspaceAction" apps/web/src/pages/workspace` lists one call
   per interaction named in Scope.
6. Public boundary is clean.
   `python scripts/ci/verify_public_boundary.py`
