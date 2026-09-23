# ─── CGRF Header ───────────────────────────────────────────────
# File:         docs/workspace-assistant.md
# Stage:        06_PLAN
# SRS:          SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-21
# Depends:      apps/pocketbase/pb_hooks/workspace-assistant.js, apps/web/src/lib/workspaceAssistant.js, apps/web/src/components/workspace/WorkspaceAssistant.jsx
# EnumType:     Doc
# EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-assistant.js; DEPENDS_ON apps/web/src/lib/workspaceAssistant.js; DEPENDS_ON apps/web/src/components/workspace/WorkspaceAssistant.jsx
# DAG Node:     none
# Intent:       Explain personal assistant isolation, inferred browser actions, scoped context and receiving acceptance without granting model authority.
# ───────────────────────────────────────────────────────────────

# Buddi, the workspace assistant, and personal knowledge

Buddi is the name members see for the workspace assistant. The rename is
presentation only: routes, collections, environment variables and code
identifiers keep the `assistant` name used below.

The persistent Buddi panel uses the existing BuildAndDo pages as its action
surface. It can navigate to each registered workspace desk, propose values for
visible ordinary fields, and activate a supported control after the user reviews
the plan. It uses the existing authenticated application paths to save records.
It does not receive a superuser client or a separate authorization path.

## Conversation to observed pattern

1. Open a desk and ask Buddi for help. The browser sends the route and
   bounded metadata for visible controls. Existing field values stay in the
   browser; password, credential, payment and human-authority controls are excluded.
2. The backend authenticates the user, checks current workspace membership, loads
   only that account's session history/patterns, and assembles bounded context
   through the existing permission-aware workspace knowledge service.
3. The configured existing agent returns JSON with a reply and at most eight
   inferred steps. Server validation permits only registered routes and captured
   control IDs. Source text, labels, model replies and learned patterns remain
   untrusted data. Model text never becomes an authorization or a verification.
4. The user reviews **Apply reviewed steps** or declines. Before every step, the
   browser compares account, workspace, route, element, label, options and original
   field value. A navigation or activation ends the plan so the next surface can
   be inspected. A changed form produces a failed/partial observation.
5. The user interaction is recorded once as applied, partial, failed or declined.
   A lost recording response can be retried without applying the action again.
   Native business receipts separately establish whether a save or action succeeded.
6. Knowledge shows personal session/pattern nodes and `OBSERVED_IN` relationships.
   Learned patterns retain the route, operation kind and field labels, not filled
   values. They are observations of interaction, never verified business results.

History is paginated and persists across refreshes. New session closes the former
conversation; closed sessions remain readable. Forget session removes its turns
and personal patterns in one transaction while preserving native business records.
The panel clears private state on account/workspace changes and discards stale
history/model responses. Demo mode performs no private read or write.

## Tenant and account boundaries

| Surface | Effective authority |
|---|---|
| Native workspace records | Existing PocketBase user auth, workspace roles and collection rules |
| Buddi sessions, turns and patterns | Locked collection CRUD; custom routes require both owner account and current workspace membership |
| Personal knowledge | Same owner/workspace filters, even when the reader is a workspace administrator |
| Viewer assistance | Navigation and explanations; no inferred form writes |
| Editor/administrator/owner assistance | Ordinary permitted form assistance; native backend permissions still decide each save |
| Approval, TEVV, permissions, publishing, deletion and secrets | Direct human controls, excluded from inferred plans |

This is PocketBase's native record-rule isolation, not a new SQL RLS layer.
Membership and relevant source-record visibility are checked again after inference.
Revocation or a role change prevents the old plan from being returned as usable.
A browser response from a different account/workspace is discarded. Application
administrators cannot browse another member's personal conversation through these
routes. Database superuser access remains an infrastructure authority outside this
public feature.

## Existing-agent binding

The receiving operator sets server-side `BUILDANDDO_ASSISTANT_URL`,
`BUILDANDDO_ASSISTANT_MODEL`, and the runtime-only `BUILDANDDO_ASSISTANT_TOKEN`
secret binding. The URL must be an operator-configured HTTPS inference endpoint,
not a URL in a user prompt. Choose the existing approved model/version at runtime.
No local model, new model server or alternate private agent infrastructure is
created by this feature.

The request uses the existing chat-completion shape: model, temperature,
max_tokens, JSON response format, a system instruction and a user data envelope.
The adapter accepts `choices[0].message.content` or Cloudflare's
`result.response`, containing exactly `{reply, steps}`. Step forms are
`{kind: "navigate", path}`, `{kind: "fill", control, value}`, or
`{kind: "activate", control}`. Navigation/activation must be last. Dynamic
classroom routes still rely on native membership; unknown routes are rejected.

The data envelope includes the explicit message, current role/routes, permitted
control metadata, this account's recent history/patterns and up to six selected
workspace sources within 6,000 characters. Citations and incomplete coverage are
retained and shown with the reply. Workspace source selection reuses the current
missions/evidence/signals/research/wiki graph; private conversations do not become
shared workspace nodes. The receiving operator must approve the provider's data
handling and workspace export policy before activation.

One inference request is bounded to 30 seconds and a 40,000-character response.
Messages are limited to 4,000 characters; replies to 8,000. A session permits
100 turns, with at most 30 new turns per account/workspace in one hour and three
bounded attempts per uncertain turn. Retry identity recovers a saved reply without
another model call. Missing/malformed provider responses leave a visible retryable
state; they never produce a mock successful plan.

## API, retention and acceptance

The native routes are `GET/POST /api/buildanddo/workspaces/{workspace}/assistant`,
`POST .../assistant/chat`, and `GET .../assistant/knowledge`. Responses use
`Cache-Control: no-store`. The migration creates locked `assistant_sessions`,
`assistant_turns` and `assistant_patterns` with scoped retry identities. Existing
session text and proposed values are private stored conversation data; the personal
pattern projection omits those values. There is no claim of automatic timed
retention or model training. The account can explicitly forget each session.

Run the production-policy/client tests with
`node --test tests/upgrade/workspace-assistant.test.mjs`. The rendered
`AssistantSurface` and `WorkspaceAssistant` suites test actual React controls,
review-before-action, privacy, retries and scope changes; the required native
workspace suite exercises real authentication, locked collections, restart and
forget behavior. These are distinct acceptance levels. A live configured-model
request and an observed browser save are still required to prove deployed use.

For rollback, remove the inference binding and keep the retained conversation
records. Migration down removes protocol markers and disables the native routes;
it does not delete personal history. Export or forget records under the user's
native authority before disabling the feature if that is the selected retention
policy. Reapplying validates the existing field and index contracts.

The supplementary `tests/upgrade/assistant-browser.mjs` exports
`runAssistantBrowserChecks(document)` for a disposable same-origin browser page
that imports the production DOM helper. It checks actual control visibility,
label/option separation, input/change events, checkboxes, navigation and stale or
human-only surfaces. Its Chromium results establish DOM behavior with synthetic
controls; they do not replace the authored React component tests or a real
provider/native-workspace journey. The retained sprint validation records both
the reproduced select-label defect and its passing rerun.
