# CGRF: SRS=SRS-BUILDANDDO-DEVENV-001,SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/api/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEVENV-001, SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-002
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/pocketbase/pb_migrations, apps/web/src/contexts/AuthContext.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_migrations; VALIDATES apps/web/src/lib/pocketbaseClient.js; CONSUMES docs/workflow-system.md
# Intent:      Write down the API surface that already exists, extracted from the
#              migrations, so the schema is readable without reading 1,600 lines of JS.
# ───────────────────────────────────────────────────────────────

# BuildAndDo API reference

The backend is [PocketBase](https://pocketbase.io). Collection endpoints use its
generated REST API over migrations in `apps/pocketbase/pb_migrations/`. Workflow
run commands use authenticated PocketBase routes so each decision and evidence
receipt can be saved together in a transaction. See [Workflow runs](../workflow-system.md).

**The migrations are the source of truth.** This document is extracted from
them by hand and can drift; when it disagrees with a migration, the migration
is right and this file needs editing. Never change schema anywhere else — not
in the admin UI, not with SQL.

Run the local stack first (see [Quick start](../../README.md#quick-start)), then
browse the same schema interactively at <http://localhost:8090/_/>.

## Base URL

| Environment | Base URL | Set by |
|---|---|---|
| Local (docker compose) | `http://localhost:8090` | `VITE_POCKETBASE_API_URL` in `.env` |
| Deployed | `/hcgi/platform` (same origin) | fallback in `apps/web/src/lib/pocketbaseClient.js:3` |

Every path in this document is relative to that base, e.g.
`GET http://localhost:8090/api/collections/missions/records`.

Useful non-collection endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness. Returns `{"code":200,...}`. Used by the compose healthcheck and `scripts/dev-setup.sh`. |
| `GET /_/` | Admin UI (superuser login). |
| `POST /api/collections/{name}/auth-with-password` | Authenticate a user or superuser. |

## Authentication

### Learning and claim commands

The guided lesson API returns a keyless learner projection, preserving full
server snapshots for grading. `GET /api/buildanddo/learning/states` returns
canonical per-account checkpoints in pages of 20; clients must not present a
truncated/failed scan as a complete catalogue. Raw `tutorial_progress` writes are
locked by `1791500000_learning_progress_authority.js`; retained rows represent
historical reading, not new guided certificates. Public quizzes remain open-book.

`POST /api/buildanddo/workspaces/{workspace}/claims` handles the seven collections
locked by `1791500001_workspace_claim_authority.js`: support sources, corrections,
daily editions, specialist desks, social content/channels and seat events. It
accepts only explicit actions with `revision`, `request_key` and bounded `payload`.
Current native users/roles and author/admin constraints precede receipt replay.
Provider fields and verification labels cannot be supplied as editable values.
New browser seat reports use the authenticated account ID and `actor_type: human`;
the native command rejects alternate identities before replaying a receipt.
See `docs/claim-authority.md` for actions, installation and retention semantics.

### Classroom media

The authenticated signalling routes below `/api/classroom` use current native
workspace membership and fresh attendance in a live classroom, not a supplied
role or publisher name. The new locked `classroom_media_sessions` collection is
not accessible through ordinary raw collection APIs. See `docs/classrooms.md`
for installation, compatibility, expiration and acceptance limits.

| Method / suffix | Body / scope |
|---|---|
| POST `/session` | `room`, `sessionDescription` (offer); returns the same room and an owned session |
| POST `/tracks` | `room`, `sessionId`, `action`, `tracks`, optional offer; local pushes require `kind`, `mid`, `trackName`, `location: local` |
| PUT `/renegotiate` | `room`, `sessionId`, `sessionDescription` (answer); only the session owner |
| POST `/close` | `room`, `sessionId`; only the owner may invalidate its binding, including after leaving |
| POST/GET `/presence` | Advertise/read exact bound tracks under current room participation and publisher authority |

Remote pulls use `location: remote`, the source `sessionId` and its exact
`trackName`. Foreign rooms, owners, stale attendance, expired/closed sessions
and unknown tracks fail before provider access. A successful provider echo is
not measured audio or independent verification. Session bindings contain no
credentials or raw SDP. `1791400001_broadcast_classroom_lessons.js` is a data-only
tutorial installation; it does not create workspace evidence or learner awards.

### The flow the app actually uses

1. `apps/web/src/lib/pocketbaseClient.js` constructs one `PocketBase` client
   from `VITE_POCKETBASE_API_URL` and exports it as a singleton. Every call in
   the app goes through it, so the auth token is shared process-wide.
2. `apps/web/src/contexts/AuthContext.jsx` wraps the app and exposes
   `{ user, isAuthed, login, signup, logout }`:
   - `login(email, password)` → `pb.collection('users').authWithPassword(...)`
   - `signup(email, password, extraFields)` → creates the `users` record, then
     immediately authenticates with it
   - `logout()` → `pb.authStore.clear()`
3. The SDK persists the token in `localStorage` and restores it on reload, so
   `pb.authStore.record` is the initial `user` value; `pb.authStore.onChange`
   keeps React state in sync.
4. `trackAuthIdentity(user)` forwards the identity to Datadog RUM when RUM is
   configured. Locally it is a no-op — RUM initialises only when both
   `VITE_DD_APPLICATION_ID` and `VITE_DD_CLIENT_TOKEN` are set.

There is no refresh-token loop in the app; PocketBase tokens are long-lived and
`authRefresh` is not called. An expired token surfaces as a 401 on the next
request and the user signs in again.

```js
// The shape every authenticated call takes
import pb from '@/lib/pocketbaseClient';

await pb.collection('users').authWithPassword(email, password);
const missions = await pb.collection('missions').getFullList({
  filter: `workspace = "${workspaceId}"`,
  sort: '-created',
});
```

Raw REST equivalent:

```bash
TOKEN=$(curl -fsS -X POST http://localhost:8090/api/collections/users/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"demo@buildanddo.local","password":"demo-localdev-1234"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -fsS http://localhost:8090/api/collections/missions/records \
  -H "Authorization: $TOKEN"
```

### Identities

| Identity | Collection | How it is created | Used by |
|---|---|---|---|
| End user | `users` | Self-signup via `AuthContext.signup`, or the seeder | The web app |
| Superuser | `_superusers` | `pb_migrations/1764579159_create_superuser.js` from `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | Admin UI, `services/praxis_evidence` |

`users` has `authAlert` disabled (`1775709407_disable_auth_alert_users.js`) — no
"new login" emails. Email verification is not enforced by any API rule.

The Praxis evidence services authenticate as the **superuser**, deliberately:
the epistemic rules (no self-audit, state transitions) live in
`services/praxis_evidence/`, not in PocketBase API rules, so those collections
are closed to direct client writes and the service is the only write path.

### Authorization model

Two layers, in this order:

1. **Owner scoping** — every workspace-scoped product collection carries an
   `owner` relation to `users` (the shared catalogs and the evidence fabric do
   not: `tutorials`, `workspace_members`, `contributor_reputation` and the
   fifteen praxis collections are scoped differently). The baseline rule is
   `@request.auth.id != '' && @request.auth.id = owner`, and on create
   `@request.auth.id = @request.body.owner` (you may only create records you
   own).
2. **Workspace membership** (`1788900000_create_workspace_members_rbac.js`) —
   workspace-scoped collections additionally allow access through a
   `workspace_members` row. Read for any member; write for `owner`, `admin`,
   `editor`; `viewer` is read-only. **Delete stays owner-only regardless of
   role.**

The membership clause uses PocketBase's any-match operator, which matters if
you write a similar rule:

```
@collection.workspace_members.workspace ?= workspace &&
@collection.workspace_members.user      ?= @request.auth.id
```

`=` instead of `?=` in a cross-collection filter silently returns zero rows —
no error, just "access denied" for every real member. That was a measured bug
(2026-09-07), documented in the migration.

Collections re-scoped by RBAC: `services`, `missions`, `signals`, `workflows`,
`roadmap_items`, `erp_contacts`, `erp_objectives`, `erp_tasks`,
`social_channels`, `social_content`, `specialist_desks`, `support_sources`,
`corrections`, `daily_editions`, `challenge_submissions`.

`domains`, `workspaces` and `evidence` remain owner-only. So does
`tutorial_progress`: the migration lists it as a target but skips any
collection without a `workspace` relation, and progress is per-user, not
per-workspace — read the migration's guard, not its target list.

### Rate limits

Enforced by PocketBase (`1769164585_set_rate_limits.js`), locally too:

| Rule | Limit |
|---|---|
| `/api` (all) | 200 requests / 5 min |
| `*:auth` (guests) | 20 attempts / 5 min |
| password reset | 5 / hour |
| email verification | 5 / hour |
| email change (authenticated) | 3 / hour |
| OTP request | 10 / hour |

A burst of 429s from a test loop is this, not a bug.

## Reading the tables below

- Every collection has PocketBase's implicit `id` (15-char text).
- `created` / `updated` are `autodate` fields, set by the server. Not every
  collection has both: `workspace_members` and most of the evidence fabric
  record only `created`, because they are append-only by design.
- **Rules** column: `owner` = the owner-scoped rule above; `owner+member` = that
  rule plus workspace membership; `authed` = any signed-in user;
  `public` = no auth; `superuser` = no API rule, service/admin only.
- Relations show the target collection; `cascade` means the row is deleted when
  its parent is.

---

## Workspace data model

The product's core loop — **observe → understand → act → verify** — maps onto
these collections. Everything hangs off a workspace, and a workspace hangs off
a user.

```
users
 └── domains ──────────── workspaces ──┬── signals        (observe)
                              │        ├── missions ───── evidence   (act / verify)
                              │        ├── workflows      (repeatable act)
                              │        ├── services       (operations surface)
                              │        ├── erp_objectives ── erp_tasks
                              │        ├── erp_contacts
                              │        └── editorial collections (below)
                              └── workspace_members  (RBAC)
```

Source: `1788474000_create_workspace_collections.js`,
`1788900000_create_workspace_members_rbac.js`.

### `domains` — rules: owner

A candidate or verified domain. "Selected" is not "authorized"; verification is
a separate state on purpose.

| Field | Type | Notes |
|---|---|---|
| `domain` | text, required | max 253 |
| `status` | select, required | `selected` \| `analyzing` \| `verified` \| `needs_attention` |
| `has_website` | bool | |
| `owner` | relation → `users`, required | cascade |

### `workspaces` — rules: owner

The container every other record is scoped to. The web app loads these in
`WorkspaceContext` with `expand: 'domain'` and remembers the active one in
`localStorage` under `bad_active_ws`.

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | max 120 |
| `domain` | relation → `domains` | optional, cascade |
| `owner` | relation → `users`, required | cascade |

### `workspace_members` — rules: see below

| Field | Type | Notes |
|---|---|---|
| `workspace` | relation → `workspaces`, required | |
| `user` | relation → `users`, required | |
| `role` | select, required | `owner` \| `admin` \| `editor` \| `viewer` |
| `invited_by` | relation → `users` | |

Unique index on (`workspace`, `user`). List/view: the member themself or the
workspace owner. Create/update: workspace owner only. Delete: workspace owner,
or the member removing themself.

### `signals` — rules: owner+member

Observations. The `type` field is the point: a fact, an inference and something
a user told you are not interchangeable evidence.

| Field | Type | Notes |
|---|---|---|
| `title` | text, required | max 200 |
| `description` | text | max 1000 |
| `source` | text | max 120 |
| `type` | select, required | `fact` \| `inference` \| `user` |
| `confidence` | number | 0–100 |
| `workspace` | relation → `workspaces`, required | cascade |
| `owner` | relation → `users`, required | cascade |

### `missions` — rules: owner+member

A bounded unit of work with an explicit lifecycle.

| Field | Type | Notes |
|---|---|---|
| `title` | text, required | max 200 |
| `description` | text | max 2000 |
| `status` | select, required | `proposed` \| `approved` \| `running` \| `needs_attention` \| `verified` \| `failed` |
| `workspace` | relation → `workspaces`, required | cascade |
| `owner` | relation → `users`, required | cascade |

### `evidence` — rules: owner

What was observed, decided, attempted, verified. Optionally attached to a
mission; always attached to a workspace.

| Field | Type | Notes |
|---|---|---|
| `content` | text, required | max 2000 |
| `type` | select, required | `observed` \| `decided` \| `attempted` \| `verified` |
| `source` | text | max 160 |
| `mission` | relation → `missions` | optional, cascade |
| `workspace` | relation → `workspaces`, required | cascade |
| `owner` | relation → `users`, required | cascade |

### `workflows` — rules: owner+member

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | max 160 |
| `description` | text | max 1000 |
| `status` | select, required | `draft` \| `active` \| `paused` |
| `steps` | JSON | ordered definitions; at most 20 bounded steps; activation requires at least one |
| `template` | text | starting template, max 80 |
| `last_run` | date | server-written when a run is created; historical activation dates are not evidence |
| `workspace` | relation → `workspaces`, required | cascade |
| `owner` | relation → `users`, required | cascade |

### `workflow_runs` — workspace reads, command-only writes

Current workspace owners and members can list/read runs. The generated create,
update and delete endpoints are locked for normal accounts. Owners, admins and
editors use `POST /api/buildanddo/workflow-runs` to start a run and
`POST /api/buildanddo/workflow-runs/{id}/decisions` to record an outcome. Approval
checkpoints require an owner or admin. Both commands use PocketBase auth and
explicit same-workspace checks. No command executes an external tool.

Each run stores its workflow/mission relations, immutable definition and approval
snapshot, ordered decision receipts, revision, current step and server timestamps.
An idempotency key identifies a submitted command; decisions also carry the
expected revision. [Request bodies, lifecycle and native acceptance](../workflow-system.md)
describe the complete contract. Ordinary collection rules on missions and
evidence are unchanged.

### `services` — rules: owner+member

The Operations surface: one card per connected or planned service.

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | max 80 |
| `purpose` | text, required | max 300 |
| `data_boundary` | text | max 300 — what the service may see |
| `status` | select, required | `planned` \| `not_connected` \| `connected` \| `degraded` \| `needs_attention` |
| `last_health_check` | date | |
| `next_action` | text | max 300 |
| `workspace` | relation → `workspaces`, required | cascade |
| `owner` | relation → `users`, required | cascade |

### `erp_objectives`, `erp_tasks`, `erp_contacts` — rules: owner+member

| Collection | Fields |
|---|---|
| `erp_objectives` | `title` (text, required, 200), `description` (text, 1000), `status` (select: `active` \| `achieved` \| `archived`), `workspace`, `owner` |
| `erp_tasks` | `title` (text, required, 200), `status` (select: `todo` \| `in_progress` \| `done`), `objective` (relation → `erp_objectives`), `workspace`, `owner` |
| `erp_contacts` | `name` (text, required, 160), `role` (text, 120), `email` (email), `notes` (text, 1000), `workspace`, `owner` |

### `tutorials` — rules: authed read, superuser write

Shared catalog, seeded with six entries by the migration.

| Field | Type | Notes |
|---|---|---|
| `title` | text, required | max 160 |
| `summary` | text | max 400 |
| `category` | text | max 80 |
| `effort_minutes` | number | min 1 |
| `prerequisites` | text | max 300 |
| `order` | number | display order |

### `tutorial_progress` — rules: owner

| Field | Type | Notes |
|---|---|---|
| `tutorial` | relation → `tutorials`, required | no cascade |
| `status` | select, required | `not_started` \| `in_progress` \| `completed` |
| `progress` | number | 0–100 |
| `owner` | relation → `users`, required | cascade |

---

## Editorial collections

Source: `1788477655_create_editorial_collections.js`. All workspace- and
owner-scoped, all empty by default (no seed data). Every one carries
`workspace`, `owner`, `created`, `updated` in addition to the fields listed.

| Collection | Fields | Status values |
|---|---|---|
| `challenge_submissions` | `problem` (text, required, 2000), `context` (text, 2000) | `submitted` \| `processing` \| `needs_info` \| `resolved` |
| `daily_editions` | `title` (required, 200), `summary` (1000), `body` (10000), `edition_date` (date) | `draft` \| `published` |
| `roadmap_items` | `title` (required, 200), `description` (2000), `owner_role` (120), `evidence_ref` (300), `dependency` (300), `next_action` (300) | `proposed` \| `planned` \| `in_progress` \| `blocked` \| `verified` \| `archived` |
| `support_sources` | `provider` (select: `patreon` \| `kofi` \| `stripe` \| `gofundme`), `last_sync` (date), `gross`, `platform_fees`, `refunds` (numbers ≥ 0), `currency` (8), `payout_status` (120), `date_range_start`, `date_range_end` (dates) | `not_connected` \| `pending` \| `connected` \| `syncing` \| `healthy` \| `degraded` \| `error` |
| `social_channels` | `platform` (select: `discord` \| `youtube` \| `x` \| `linkedin` \| `instagram` \| `tiktok` \| `bluesky`), `handle` (160), `last_check` (date) | `not_connected` \| `pending` \| `connected` \| `healthy` \| `degraded` \| `error` |
| `social_content` | `title` (required, 200), `body` (5000), `channel` (160), `scheduled_for` (date) | `draft` \| `awaiting_approval` \| `scheduled` \| `published` \| `failed` |
| `specialist_desks` | `desk` (select: `research` \| `strategy` \| `operations` \| `verification` \| `risk` \| `recovery` \| `history` \| `optimization`), `scope` (500) | `idle` \| `active` \| `blocked` |
| `corrections` | `prior_prediction` (required, 2000), `observed_result` (2000), `reference` (300) | `pending` \| `verified` \| `rejected` |

---

## Praxis Evidence Fabric

Source: `1788800000_create_praxis_evidence_fabric.js` plus three later
migrations. Fifteen collections (sixteen with `contributor_reputation`, added
later and documented under Governance below) modelling evidence classes that behave
differently under scrutiny: a claim is not a fact merely for existing; a price
is a dated, located observation; a belief must never silently promote into a
claim; timing is a distribution; community consensus is evidence, not truth.

**Access:** all of them are `listRule: ""` / `viewRule: ""` — **publicly
readable, no write access through the API at all.** Writes go through
`services/praxis_evidence/`, which authenticates as the superuser and enforces
the state machine in application code. Do not add client write rules here; that
would bypass every epistemic guarantee the fabric exists to provide.

Each of the fifteen fabric collections has a unique `display_id` (text, max
40) and a `created` timestamp. `contributor_reputation` is the exception: no
`display_id`, unique on (`user`, `domain`) instead.

### Knowledge

| Collection | Key fields |
|---|---|
| `knowledge_sources` | `url`, `title` (300), `publisher` (200), `source_type` (`WEB` \| `API` \| `COMMUNITY` \| `EXPERIMENT` \| `TELEMETRY` \| `PUBLICATION` \| `BOOK` \| `STANDARD`), `captured_at`, `content_hash` (128), `notes` (editor), and six self-relations: `derived_from`, `copies`, `reproduces`, `contradicts_sources`, `independent_of`, `cites` |
| `knowledge_claims` | `subject`/`predicate`/`object` (required, 300 each), `domain` (required), `context` (json), `epistemic_state`, `confidence` (0–1), `supporting_sources` / `contradicting_sources` (→ `knowledge_sources`), `observed_at`, `valid_until`, `submitted_by` (→ `users`) |
| `knowledge_logic` | `domain`, `rule_type` (`DETERMINISTIC` \| `EMPIRICAL_RULE` \| `HEURISTIC` \| `CAUSAL_HYPOTHESIS` \| `CULTURAL_RULE` \| `LEGAL_RULE`), `if_conditions` / `then_result` (json, required), `certainty`, `falsifier`, `evidence` (→ `knowledge_claims`), `status` (`PROPOSED` \| `COMMUNITY_TESTED` \| `VERIFIED` \| `REFUTED`) |
| `knowledge_beliefs` | `proposition` (editor, required), `attributed_actor`, `attributed_community`, `attributed_school`, `attributed_tradition`, `domain`, `evidence_of_belief` (json), `supports_claims` / `conflicts_with_claims` (→ `knowledge_claims`), `prevalence_state` (`UNKNOWN` \| `MEASURED`), `epistemic_class` (**only** `ATTRIBUTED_BELIEF`) |

`epistemic_state` on a claim:
`USER_ASSERTED`, `EXTRACTED`, `SOURCE_BACKED`, `CORROBORATED`,
`COMMUNITY_AUDITED`, `EXPERT_REVIEWED`, `REPRODUCED`, `FIELD_VERIFIED`,
`DISPUTED`, `REFUTED`, `STALE`.

`knowledge_beliefs.epistemic_class` has exactly one allowed value, so a belief
cannot be mutated into a claim — the schema, not a code path, prevents it.

### Praxis

| Collection | Key fields |
|---|---|
| `praxis_methods` | `objective` (required, 300), `domain`, `prerequisites`/`parameters`/`applicable_context`/`contraindications`/`outcome_metrics` (json), `steps` (editor), `advantages_evidence`/`disadvantages_evidence` (→ `knowledge_claims`), `community_attempts`, `community_verified_successes` (numbers, deliberately not required — PocketBase rejects literal `0` on a required number field), `knowledge_state` (`PROPOSED` \| `COMMUNITY_TESTED` \| `VERIFIED` \| `DISPUTED` \| `DEPRECATED`) |
| `praxis_materials` | `canonical_name` (required, 200), `category` (required, 120), `aliases`/`specification`/`substitutions`/`hazards` (json), `compatible_methods` (→ `praxis_methods`), `evidence_claims` (→ `knowledge_claims`) |
| `praxis_tools` | `canonical_name` (required, 200), `category` (required, 120), `specification` (json), `compatible_methods`, `evidence_claims` |
| `praxis_pricing` | `material` (→ `praxis_materials`, required), `amount`, `currency` (required), `quantity_value`, `quantity_unit` (required), `vendor`, `country`/`region`/`locality`, `channel` (`ONLINE` \| `STORE` \| `WHOLESALE` \| `COMMUNITY_REPORTED`), `membership_required`, `sale`, `bulk_quantity`, `shipping_included`, `tax_included`, `observed_at` (required), `source_url`, `evidence_hash`, `verification_state` (`OBSERVED` \| `CORROBORATED` \| `STALE`) |
| `praxis_timing` | `praxis_method` (required), `activity` (required), `duration_value`, `duration_unit` (`MINUTES` \| `HOURS` \| `DAYS` \| `WEEKS` \| `SESSIONS`), `sessions`, `minutes_per_session_mean`, `experience_level`, `prior_skill` (json), `criterion_met`, `confidence` (`USER_REPORTED` \| `MEASURED` \| `EXPERT_VALIDATED`), `observed_at` (required) |

A price is never stored as a bare number: currency, quantity, channel, place
and observation date are all required context.

### Experience

| Collection | Key fields |
|---|---|
| `experience_attempts` | `actor` (→ `users`), `praxis_method` (required), `context`/`steps_completed`/`deviations`/`materials_consumed`/`materials_substituted`/`evidence_media` (json), `timing_value`, `timing_unit`, `actual_cost`, `verification_state` (`SELF_REPORTED` \| `PEER_REVIEWED` \| `EXPERT_VERIFIED`), `observed_at` (required) |
| `experience_outcomes` | `attempt` (→ `experience_attempts`, required), `metric_name` (required), `metric_value` (json, required), `rubric` (json), `observed_at` (required) |
| `experience_failures` | `attempt` (required), `failure_description` (editor, required), `recovery_attempted` (editor), `root_cause_hypothesis` (500), `observed_at` (required) |

### Governance

| Collection | Key fields |
|---|---|
| `governance_audits` | **Append-only** — no update or delete rule at all; a correction is a new audit row plus a supersession, never an edit. `target_type`, `target_id`, `action` (16 values incl. `CORROBORATE`, `FAIL_TO_REPRODUCE`, `PRICE_UPDATE`, `SAFETY_FLAG`), `result` (`CONFIRMED` \| `CONTRADICTED` \| `INCONCLUSIVE` \| `FLAGGED`), `observation`/`evidence` (json), `auditor` (→ `users`, required), `auditor_relevant_xp`/`_tp` (json), `independent` (bool, required), `observed_at` (required) |
| `governance_disputes` | `subject_type`/`subject_id`, `position_claim_a`/`_b` (→ `knowledge_claims`), `conflict_type`, `context_difference_possible`, `evidence` (json), `state` (`OPEN` \| `RESOLVED` \| `STALE`) |
| `governance_research_quests` | `trigger_reason` (9 values incl. `CLAIM_DISPUTED`, `PRICE_STALE`, `SAFETY_FLAG`), `question` (required, 500), `subject_type`/`subject_id`, `required_capabilities` (json), `status` (`OPEN` \| `IN_PROGRESS` \| `RESOLVED` \| `ABANDONED`) |
| `contributor_reputation` | `user` (→ `users`, required), `domain` (required), `xp`, `tp`, `verified_contributions`. Unique on (`user`, `domain`). XP and TP settle only from independently verified audit outcomes — never from submission volume or self-verification. |

`knowledge_claims.submitted_by` exists so an audit can compare the real author
against the auditor: "self-audit cannot settle verification" is checked against
recorded authorship, not against a caller-supplied `independent` flag.

---

## Platform collections

### `early_access` — rules: public create, superuser read

The only publicly writable collection in the system.

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | max 120 |
| `email` | email, required | indexed |
| `business_type` | text, required | max 120 |
| `task` | text, required | max 1000 |

`createRule: ""` (anyone may submit), everything else `null` (superuser only).
Submissions are not readable by the submitter.

### `users` — PocketBase auth collection

Standard PocketBase auth fields (`email`, `password`, `verified`,
`emailVisibility`, `name`, `avatar`). `authAlert` disabled. Referenced
everywhere as `owner`, `user`, `actor`, `auditor`, `submitted_by`.

---

## Collection inventory

38 collections defined by migrations, plus PocketBase's built-in `users` and
`_superusers`. In migration order:

| Migration | Collections |
|---|---|
| `1788471988_create_early_access.js` | `early_access` |
| `1788474000_create_workspace_collections.js` | `domains`, `workspaces`, `signals`, `missions`, `workflows`, `services`, `evidence`, `tutorials`, `tutorial_progress`, `erp_objectives`, `erp_tasks`, `erp_contacts` |
| `1788477655_create_editorial_collections.js` | `challenge_submissions`, `daily_editions`, `roadmap_items`, `support_sources`, `social_channels`, `social_content`, `specialist_desks`, `corrections` |
| `1788800000_create_praxis_evidence_fabric.js` | `knowledge_sources`, `knowledge_claims`, `knowledge_logic`, `knowledge_beliefs`, `praxis_methods`, `praxis_materials`, `praxis_tools`, `praxis_pricing`, `praxis_timing`, `experience_attempts`, `experience_outcomes`, `experience_failures`, `governance_audits`, `governance_disputes`, `governance_research_quests` |
| `1788900000_create_workspace_members_rbac.js` | `workspace_members` (+ re-scopes 15 collections) |
| `1788920000_add_claim_authorship_and_reputation.js` | `contributor_reputation` (+ `knowledge_claims.submitted_by`) |
| `1789600000_create_workflow_runs.js` | `workflow_runs` with workspace reads, locked direct writes and request-key uniqueness |
| `1792100000_buddi_intake.js` | `buddi_intake`, superuser-only; down keeps every row |
| PocketBase built-ins | `users`, `_superusers` |

The remaining migrations change settings, data or individual fields rather
than creating collections:

| Migration | Effect |
|---|---|
| `1759383931_initial_app_settings.js` | app name, log retention, trusted proxy headers |
| `1764579159_create_superuser.js` | creates the `_superusers` record from `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` |
| `1769159103` / `1775709407` | disable auth alert emails for superusers and users |
| `1769164585_set_rate_limits.js` | the rate limits above |
| `1788910000_add_source_cites_relation.js` | adds `knowledge_sources.cites` |
| `1788930000_add_research_quest_question.js` | adds `governance_research_quests.question` (required, max 500) |

Check this list against the running database rather than trusting the table —
the local stack applied the same migrations production did:

```bash
TOKEN=$(curl -fsS -X POST http://localhost:8090/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"admin@buildanddo.local","password":"localdev-change-me"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -fsS "http://localhost:8090/api/collections?perPage=200&fields=name,type" \
  -H "Authorization: $TOKEN"
```

## Server-side hooks

`apps/pocketbase/pb_hooks/*.pb.js` run inside PocketBase's embedded JavaScript
VM. There is no build step. They are mounted read-only into the container, so
an edit takes effect on `docker compose restart pocketbase`.

| Hook | What it does | Local behaviour (`PB_NODE_ENV=development`) |
|---|---|---|
| `logs-forwarder.pb.js` | On `production`, writes each `_logs` row to stdout/stderr **instead of** the database (it returns without `e.next()`). On `development` or unset, the row is persisted normally and also appended to a session-journal file. | Logs stay readable in the admin UI's Logs view. The journal append targets `vault/temp/SESSION_JOURNAL.md` **inside the container** — harmless, and not visible on your host. Set `PB_NODE_ENV=production` in `.env` if you would rather read logs with `docker compose logs -f pocketbase`. |
| `builder-mailer.pb.js` | Intercepts outgoing mail and posts it to an external mail API. The guard is `smtp.enabled` in PocketBase settings, **not** the environment variables. | With SMTP disabled and `BUILDER_MAILER_*` unset, anything that sends mail (password reset, verification) fails with a 500. Nothing in a normal local flow sends mail; if you need it, enable SMTP in the admin UI. |
| `reach-contact-sync.pb.js` | Fires after every `early_access` record is created and posts the contact to an external CRM. No environment guard. | The request fails and the error is logged and swallowed, so the `early_access` record is still saved. Submitting the early-access form locally is safe. |
| `custom-migrations-cmd.pb.js` | Adds `pocketbase horizons migrations:up` and `migrations:revert <file>` | Available inside the container |
| `public-api.pb.js` | Mounts Buddi's eight tool routes under `/api/v1/public` (see below). | Reads work as-is. Writes answer `503` until `BUDDI_TOOL_SECRET` is set in `.env`; product-context reads its published files from `https://buildanddo.com` unless `BUILDANDDO_PUBLIC_ORIGIN` says otherwise. |

## Public tool API (`/api/v1/public`)

Eight routes answer the tools of Buddi, the public ElevenLabs voice agent. The
tools call `https://buildanddo.com/api/v1/public/...`; the `buildanddo-edge`
worker (`apps/edge/src/public-api.js`) forwards that to
`/hcgi/platform/api/v1/public/...` with the method, query, body and headers
intact, refuses malformed paths itself, and turns any non-JSON answer into a
JSON `502` so the site shell can never answer in the backend's place. Routes:
`apps/pocketbase/pb_hooks/public-api.pb.js`.

Every response carries `schema`, `authority` (`A0` or `A2`), `source` and
`as_of`.

| Route | Authority | Answers from |
|---|---|---|
| `GET product-context?section=` | A0 | reviewed repository statements, the live lesson catalogue, and `capabilities.json` / `roadmap-status.json` / `platform-health.json` fetched from `BUILDANDDO_PUBLIC_ORIGIN` (cached 5 minutes; a non-JSON answer is reported `UNAVAILABLE`) |
| `GET challenges/demo?problem_category=&business_type=&objective=&limit=` | A0 | authored lessons; `limit` 1-10 (larger is capped); no match is an `EMPTY` list with the reason |
| `GET challenges/{challenge_id}/state?mission_id=` | A0 | one authored lesson: steps, verifier, content digest |
| `GET evidence?challenge_id=&mission_id=&evidence_id=&evidence_type=` | A0 | lesson references and digests; fabric records only while their list and view rules are `""` |
| `GET replay/{challenge_id}?mission_id=` | A0 | the lesson's public history; runs are private |
| `POST challenges/request` | A2 | `buddi_intake` |
| `POST feedback` | A2 | `buddi_intake` |
| `POST support/handoff` | A2 | `buddi_intake`, plus a moderator notice |

**What a challenge is.** An authored lesson: a `tutorials` record with both a
`slug` and a `curriculum_version`, which only the curriculum migrations set.
The lessons are public by design (the site bundles them for anonymous readers),
so they are served even though the collection's own rule asks for sign-in; any
other `tutorials` record is not. The knowledge check's answer is never
returned. `challenge_id` is the slug or the record id.

**What is never returned.** Runs. A lesson run is a learner's own
`tutorial_learning` record and a Challenge Desk run is a workspace mission;
neither is read by these routes, so any `mission_id` answers the same
`404 {"state":"UNKNOWN"}` whether or not it exists. An id that exists but is not
public answers exactly like one that never existed.

**Writes** are refused in this order: `503 CLOSED` while `BUDDI_TOOL_SECRET` is
unset or shorter than 32 characters; `401` unless `x-buddi-tool-secret` matches
(compared as SHA-256 digests in constant time); `400` without a valid
`x-conversation-id` or for a body outside the tool schema (unknown field,
missing required field, over-length or control characters, `rating` outside
1-5); `413` over 16000 characters; `404` for a demo-challenge request naming a
challenge that is not public; `429` after 5 stored requests in one conversation
or 200 across all conversations in an hour. Otherwise `201` with
`receipt_id`, the new row's id. An identical retry in the same conversation gets
`200` and the same receipt. A handoff posts to `BUDDI_HANDOFF_DISCORD_WEBHOOK`
when set (`allowed_mentions` none, embeds suppressed) and reports
`notification: sent | not_configured | failed:<status>`.

### `buddi_intake` — rules: superuser only

| Field | Type | Notes |
|---|---|---|
| `kind` | select, required | `feedback`, `handoff`, `challenge_request` |
| `payload` | json, required | the validated tool body |
| `payload_digest` | text, required | SHA-256 of kind and payload; unique with `conversation_id` |
| `conversation_id` | text, required | from `x-conversation-id` |
| `trace_id`, `campaign_id` | text | from `x-trace-id`, `x-campaign-id`; dropped if malformed |
| `status` | select, required | `received`, `reviewed`, `closed` |
| `notification` | text | handoffs only |
| `protocol_version` | number | the marker the routes require; the down migration removes only this, keeping every request |

Acceptance: `python tests/upgrade/test_public_api_native.py --require-binary`
with `BUILDANDDO_TEST_POCKETBASE` set, `node --test tests/upgrade/public-api.test.mjs`
and `npm --prefix apps/edge test`.

## Changing the schema

1. Add a file to `apps/pocketbase/pb_migrations/` named
   `<unix-timestamp>_<description>.js`, following the existing pattern:
   idempotent `ensure()`-style creation and a real down-migration.
2. Apply it locally: `docker compose restart pocketbase-migrate` (or
   `docker compose up -d pocketbase-migrate`) and read the logs.
3. Update this document in the same PR.
4. Never edit a running database by hand, and never edit a migration that has
   already been applied in a deployed environment — write a new one.
