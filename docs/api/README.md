# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/api/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEVENV-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/pocketbase/pb_migrations, apps/web/src/contexts/AuthContext.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_migrations; VALIDATES apps/web/src/lib/pocketbaseClient.js
# Intent:      Write down the API surface that already exists, extracted from the
#              migrations, so the schema is readable without reading 1,600 lines of JS.
# ───────────────────────────────────────────────────────────────

# BuildAndDo API reference

The backend is [PocketBase](https://pocketbase.io). There is no hand-written
API layer: every endpoint below is PocketBase's generated REST API over
collections defined in `apps/pocketbase/pb_migrations/`.

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
| `workspace` | relation → `workspaces`, required | cascade |
| `owner` | relation → `users`, required | cascade |

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

## Changing the schema

1. Add a file to `apps/pocketbase/pb_migrations/` named
   `<unix-timestamp>_<description>.js`, following the existing pattern:
   idempotent `ensure()`-style creation and a real down-migration.
2. Apply it locally: `docker compose restart pocketbase-migrate` (or
   `docker compose up -d pocketbase-migrate`) and read the logs.
3. Update this document in the same PR.
4. Never edit a running database by hand, and never edit a migration that has
   already been applied in a deployed environment — write a new one.
