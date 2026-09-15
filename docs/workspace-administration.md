# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/workspace-administration.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/pocketbase/pb_hooks/administration.pb.js, apps/pocketbase/pb_hooks/workspace-administration.js, apps/pocketbase/pb_hooks/workspace-community.js, apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js, apps/pocketbase/pb_migrations/1790000000_workspace_administration.js, apps/web/src/lib/workspaceControl.js, tests/upgrade/workspace-administration.test.mjs, tests/upgrade/workspace-community.test.mjs, tests/upgrade/workspace-control-client.test.mjs
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/administration.pb.js; CONSUMES apps/pocketbase/pb_hooks/workspace-administration.js; CONSUMES apps/pocketbase/pb_hooks/workspace-community.js; CONSUMES apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js; CONSUMES apps/pocketbase/pb_migrations/1790000000_workspace_administration.js; CONSUMES apps/web/src/lib/workspaceControl.js; VERIFIED_BY tests/upgrade/workspace-administration.test.mjs; VERIFIED_BY tests/upgrade/workspace-community.test.mjs; VERIFIED_BY tests/upgrade/workspace-control-client.test.mjs
# DAG Node:    none
# Intent:      Explain workspace authority, retained administration records and concrete native/browser acceptance before activating community and integration controls.
# ───────────────────────────────────────────────────────────────

# Workspace administration, community and integration controls

Administration at `/app/admin` manages the current workspace's profile, feature
settings, membership and audit history. `/app/integrations` controls requested
sink, extension, Discord and Reddit configuration. `/app/wiki` and `/app/forums`
provide persisted team content with publication and moderation. Settings,
Community and Operations link to these same controls.

These are workspace roles. They do not grant a site-wide superuser account,
deployment authority or access to another workspace. Existing PocketBase user
authentication remains the only browser authentication mechanism. The owner in
`workspaces.owner` is the authority root; a membership row named `owner` has
administrator capabilities without ownership transfer or administrator grants.

## Roles and row access

| Operation | Owner | Administrator | Editor | Viewer |
|---|---|---|---|---|
| Read current workspace records | yes | yes | yes | yes |
| Contribute ordinary records | yes | yes | yes | no |
| Change profile, community settings and integration requests | yes | yes | no | no |
| Grant/change/remove editor and viewer access | yes | yes | no | no |
| Grant/change/remove administrator access | yes | no | no | no |
| Change own membership or canonical ownership | no | no | no | no |
| Create wiki drafts and forum contributions | yes | yes | yes | no |
| Edit another author's wiki draft | yes | yes | no | no |
| Publish/archive wiki or moderate discussions | yes | yes | no | no |
| Read audit history | yes | yes | no | no |
| Edit audit receipts or report an integration healthy from the browser | no | no | no | no |

RLS here means PocketBase collection API rules together with request policies.
PocketBase uses SQLite; this change does not introduce PostgreSQL RLS or claim
that database administrators are restricted by browser API rules. Direct database
access and PocketBase superusers remain trusted server responsibilities.

`1789900000_secure_workspace_rbac.js` replaces historical record-owner read
shortcuts with current membership bound through the record's workspace. A former
member's authorship does not preserve access. Nineteen existing workspace
collections use current-role write checks, immutable owner/workspace relations,
and applicable same-workspace relation checks. Evidence and business/mission
policies continue to add their own restrictions. Personal tutorial progress
keeps its account-owned rules. Seat events remain append-only.

Native membership and workspace-management writes are locked; initial workspace
creation still checks the authenticated owner and their domain. New control,
integration, audit, wiki and forum collections lock every ordinary API operation.
Their custom endpoints check the current account and workspace on every request.
Commands recheck permissions inside their transaction. An account-wide browser
role, hidden button or user-editable field is never an authorization grant.

## Using the controls

1. Open Settings to see the observed workspace role and account ID. An existing
   member shares that ID with an administrator. The member form grants access
   immediately to that exact existing account; it does not send an invitation
   or expose an account directory.
2. In Administration, edit the name and description and enable the wiki/forum
   as needed. Both begin disabled for workspaces without saved settings. Editor
   forum contributions require moderation by default.
3. A wiki contributor saves a draft with a unique page name. The author and
   administrators can read the draft. An administrator publishes it to workspace
   members. Published or archived content must return to draft before editing;
   publication account/time is attributed by the server. The reader renders
   paragraphs as text, including literal HTML, without executing markup.
4. Editors submit topics and replies. With moderation enabled, pending content
   is visible only to the author and administrators. Moderators record a reason
   to approve, hide or lock a topic, or approve/hide a reply. Hidden topics are
   unavailable to ordinary members, including the author. Locked/pending/hidden
   topics reject new replies at the server. Viewers read approved discussions.
5. Administrators configure an integration, request enabled/disabled state, or
   request a health check. The latest observation carries a timestamp and receipt
   reference. A request alone cannot change the observed state to healthy or
   prove that disabling has taken effect. Old service/channel cards are retained
   as historical records; their reported status is not a new health check.

All lists are paginated in groups of twenty. Pending inputs survive rejected
saves. A revision conflict asks for an explicit reload. If a response is lost,
the client freezes the original command and retry key until its saved receipt
is recovered. Duplicate clicks cannot create a second submission from that
client. The pending key is held in memory; after a full tab reload, inspect the
audit/content list before submitting again. Persistent offline command queues
are not included.

An unconfirmed save freezes its fields but the dialog can close. Keyboard focus
then moves to the recovery control, which retains the original request for retry.

Account, workspace and demo transitions discard private view state and stale
responses. A save finishing after a pagination change refreshes the current
view. Independent readers opt out of shared SDK cancellation. Demo/anonymous
controls issue no private request. Capability checks refresh on window focus;
revocation takes effect at the next backend request, not through an assertion
that previously viewed content can be erased from a browser.

## API and persistence contract

Every endpoint begins `/api/buildanddo/workspaces/{workspace}` and requires
PocketBase `users` authentication. Responses use `Cache-Control: no-store`.

| Method/suffix | Purpose |
|---|---|
| GET `/access` | Current role, capabilities and feature settings |
| GET `/admin` | Profile and bounded member/audit pages (`members_page`, `audit_page`) |
| POST `/admin` | Settings, member and integration commands |
| GET `/integrations` | Supported configurations and separate executor observations |
| GET `/wiki` | Allowed wiki pages (`page`) |
| GET `/forums` | Allowed discussion topics (`page`) |
| GET `/forums/{id}` | One readable topic and allowed replies (`page`) |
| POST `/community` | Wiki, topic, reply and moderation commands |

POST bodies have exactly `action`, `revision`, `request_key`, and `payload`.
`request_key` is an opaque 16–80 character identifier, scoped by workspace and
actor. Settings, members and integrations share the workspace settings revision.
Wiki edits/transitions and moderation use their record revision. New wiki pages
and topics use zero; replies use the current topic revision.

| Action | Payload fields |
|---|---|
| `settings.save` | name, description, wiki_enabled, forum_enabled, forum_moderation |
| `member.set` / `member.remove` | user and role / user |
| `integration.save` | provider, enabled, configuration |
| `integration.check` | provider |
| `wiki.save` | id (empty for new), title, slug, body |
| `wiki.transition` | id, status |
| `forum.create` / `forum.reply` | title, body / topic, body |
| `forum.moderate` | kind (topic/reply), id, status, note |

The command and immutable audit receipt are saved in one transaction. A matching
retry returns its original minimal result; conflicting key reuse or stale
revisions return 409. Denied roles return 403, unreadable records 404, malformed
commands 400 and missing required schema 503. Field-name allowlists reject role,
ownership, health or credential fields outside the command's format. Audit list
responses contain action/actor/target/revision/time without raw draft bodies.

## Integrations and the private executor

| Provider | Configuration | Allowed mode |
|---|---|---|
| Discord | numeric guild_id, channel_id | read, reviewed_publish |
| Reddit | subreddit name | read, reviewed_publish |
| Datadog / PostHog | registered binding name | telemetry |
| Firecrawl / Supabase | registered binding name | read |
| n8n | registered binding name | reviewed_run |
| Mautic / Twenty | registered binding name | reviewed_publish / read |

These inputs store non-secret configuration only. They do not accept arbitrary
URLs, tokens or browser-supplied runtime receipts. Configuring an operation mode
does not approve a particular publication or workflow execution. The private
operator must bind the target and enforce the existing action approval policy.

`workspace_integrations` separates `desired_enabled`, `configuration`, `revision`,
`requested_by`, `requested_at`, and `check_requested_at` from executor-owned
`applied_revision`, `observed_state`, `observed_at`, and `receipt_ref`. An
observation is current only with a receipt, matching configuration revision and
a nonfuture timestamp at most fifteen minutes old. Historical observations stay
explicitly out of date. Missing observations remain unknown.

No executor, Discord/Reddit post, sink activation or credential provisioning runs
from this source change. The receiving contract and acceptance requirements are
in `.bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md`.

## Acceptance before activation

```bash
node --test tests/upgrade/workspace-administration.test.mjs tests/upgrade/workspace-community.test.mjs tests/upgrade/workspace-control-client.test.mjs
npm --prefix apps/web test -- src/pages/workspace/__tests__/AdministrationFlow.test.jsx src/pages/workspace/__tests__/CommunityFlow.test.jsx src/hooks/__tests__/useWorkspaceControl.test.jsx src/__tests__/AppRoutes.test.jsx src/pages/workspace/__tests__/OperationsPage.test.jsx
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

The Node cases execute actual command, migration and client source with
transactional storage doubles. The new UI tests use the real client and server
policies as well. Neither establishes native API-rule or SQLite concurrency
behavior. This sandbox lacks frontend dependencies and the native PocketBase
binary; browser, frontend and native acceptance remain required.

On an isolated PocketBase 0.28.4 acceptance instance, apply the complete migration
sequence and install all hooks together. Use existing test-account procedures:

1. Check owner/admin/editor/viewer access, an unrelated workspace and a removed
   member through the native records API. Verify bound relation rules on all
   nineteen affected collections, including a former author. Reject ordinary
   membership/workspace-management writes, all native control/community writes,
   forged roles and cross-workspace evidence/task/run references. Positive
   onboarding still creates an owned workspace and checks domain ownership.
2. Verify administrator grants only from the canonical owner, self/owner
   protection, lower-role management and removal. A membership called owner must
   not acquire canonical owner powers. Confirm audit rows cannot be edited,
   expanded via unrelated collections, or read by ordinary members.
3. Race commands with the same and different retry keys/revisions. Lose responses
   after persistence, retry, and verify one membership change/contribution and
   receipt. Inject an audit failure and confirm both writes roll back. Race
   member revocation with a command and record the resulting transaction order.
4. Verify private drafts and pending/hidden topics/replies using each role.
   Publish a wiki page, return to draft and edit it; moderate/lock a discussion.
   Feature disabling must deny writes even from previously opened pages. Test
   JSON/text bounds, collection indexes and server-attributed timestamps.
5. Verify rule/schema replay, custom-rule/type/relation rejection before any
   change, and data-retaining down/up behavior. Confirm this with the actual
   PocketBase field/JSVM APIs; the Node models do not prove native compatibility.
6. Run the UI suites, coverage thresholds, lint and production build. Exercise
   navigation, member removal confirmation, rejected and uncertain saves,
   stale permissions and account/workspace/demo changes at 320/375/1280 px in
   both themes. Check keyboard focus trap/return and absence of page overflow.
7. Independently activate an approved private executor and verify request,
   applied revision, matching receipt, requested disable and failed checks.
   Finally match the accepted source/build to the actual served release. A
   successful health response alone does not identify the deployed version.

## Rollback and retention

For a frontend rollback, retain the stricter access rules and additive data.
The administration schema down migration preserves settings, integration
requests, wiki/forum records and audit history. It removes the protocol marker,
making command endpoints return unavailable until an up migration restores it.
Ordinary collection access remains locked throughout.

The RBAC down migration restores the exact previous rules without deleting
records. Those previous rules include historical authorship access and fewer
write restrictions: this is an explicit compatibility rollback, not the default
recovery action. Coordinate any rule rollback with the private security owner
and compatible request hooks. Removing hooks while permissive rules remain
would remove current-role write enforcement. Do not down unrelated earlier
business/workflow migrations or delete evidence to recover this release.
