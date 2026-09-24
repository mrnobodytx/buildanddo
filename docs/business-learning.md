# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/business-learning.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js, apps/pocketbase/pb_hooks/business-policy.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/web/src/components/workspace/ContentStudio.jsx, apps/web/src/components/workspace/TutorialReader.jsx, apps/web/src/pages/workspace/ErpPage.jsx
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js; VALIDATES apps/pocketbase/pb_hooks/business-policy.js; CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; CONSUMES apps/web/src/components/workspace/ContentStudio.jsx; CONSUMES apps/web/src/components/workspace/TutorialReader.jsx; CONSUMES apps/web/src/pages/workspace/ErpPage.jsx
# DAG Node:    none
# Intent:      Explain how to test business planning, reviewed content and the first 25 tutorials without confusing source, learning or publication records with live delivery.
# ───────────────────────────────────────────────────────────────

# Business planning, content and the Field Manual

ERP now connects measurable objectives, editable tasks and contacts. Content
studio turns a brief into an editable blog, tutorial or social outline, with a
formatted preview and an explicit review before publication can be recorded.
The Field Manual opens complete lessons with worked examples and exercises.

The application records human work. It does not run a private agent, send
messages, schedule external posts or make a financial transaction. Drafting
outlines are deterministic writing prompts based on the author's input.

## ERP workflow

Open `/app/erp`. An objective has a description, success measure, review due
date and explicit active/achieved/archived state. A task has details, priority,
due date, state and optional links to an objective and point of contact.
Contacts retain name, role, email and notes; no message is sent by saving one.

Create or edit records, then use search and status/priority filters. Overdue
means an unfinished task with a valid date before the local calendar day.
Missing or malformed dates never become epoch dates. Linked task completion
counts summarize saved tasks; assess the objective's success measure separately.
Unavailable reads show an error and unknown counts instead of a false empty list.

The existing collection rules still apply. Request hooks additionally check
current workspace write roles, immutable owner/workspace fields and readable
same-workspace objective/contact relations. A client dropdown is not the
authorization boundary. Demo mode cannot write; changing account or workspace
closes drafts and discards late UI results. Forms retain input after failure.
If an old backend drops a new field, the UI retains the returned record identity
and entered values and reports the incomplete save rather than creating a
second record on retry.

## Content workflow

Open `/app/community` and select **Content studio**. Social connections remain
in their own tab and only request connection work.

1. Create a draft with a format, audience, brief, optional objective, channel
   and next reader action. Create outline fills an empty body; replacing existing
   copy needs an explicit confirmation. The original saved record is unchanged
   until Save draft succeeds.
2. Replace the writing prompts and review the preview. It supports headings,
   paragraphs and ordered/unordered lists. HTML-looking input stays text; no
   raw HTML is evaluated. Body size remains limited to the existing 5,000 chars.
3. Save and request review. An audience and body are required. An owner or admin
   records accuracy, privacy, rights and accessibility checks plus a review note.
   Approval account/time come from the server, not the request payload.
4. Approved copy and its brief cannot change without returning to draft and
   clearing the old approval. A planned date records an editorial plan and does
   not install or invoke an external scheduler.
5. After independently authorized publication, an owner/admin can record its
   checked HTTPS URL. The server records the assertion's actor and time. This is
   not the external platform's first-publication timestamp or delivery proof.
   Published records cannot be edited or deleted through ordinary requests;
   copy the content to a new draft for a revision.

Allowed content transitions:

| From | Available next states |
|---|---|
| draft | draft, awaiting_approval |
| awaiting_approval | awaiting_approval, draft, approved |
| approved | draft, scheduled, published |
| scheduled | draft, scheduled, published |
| failed (legacy) | draft |
| published | retained; copy to a new draft |

Legacy planned/published labels have no inferred approval or delivery receipt.
An old planned record must return to draft and receive a saved review. Browser
responses missing required receipt fields are reported as incomplete, not as
successful approval or publication.

The current claim-authority migration locks raw editorial and report writes.
Existing buttons use `/api/buildanddo/workspaces/{workspace}/claims` with native
account attribution, saved revisions and stable retry identities. Authors edit
their own drafts; current administrators may manage them and record publication.
Another editor cannot rewrite the draft or reset its review. Approval/publication
continues to use the existing content validator, not merely a new status label.
See `docs/claim-authority.md` for the seven-collection boundary and retained history.

## The first 25 tutorials

The shared, versioned source is
`apps/pocketbase/pb_migrations/data/starter-tutorials.json`, version `2026.09.1`.
Each lesson includes outcomes, why, preparation, instruction, four practical
steps, an illustrative example, an exercise/checklist, a three-choice knowledge
check with feedback, and references. Examples are instructional, not customer
records or claims of production outcomes.

| Path | Lessons |
|---|---|
| Foundations | 1 Welcome; 2 Domain selection and verification; 3 Signals; 4 Mission proposals and approval; 5 Evidence and replay |
| Operations | 6 Service connections; 7 Measurable objectives; 8 Linked tasks; 9 Priorities and due dates; 10 Contact hygiene |
| Missions & workflows | 11 Risk and rollback; 12 TEVV; 13 OWASP checks; 14 Approval checkpoints; 15 Failed runs and retries |
| Content production | 16 Audience briefs; 17 Blog drafting; 18 Tutorial design; 19 Social adaptation; 20 Editorial review |
| Practice & improvement | 21 Publication receipts; 22 Weekly operations review; 23 Mobile/keyboard checks; 24 Content evaluation; 25 Release evidence |

Lessons are the default tab at `/app/tutorials`, also shared with Docs and Home.
Readers can search by topic, choose a learning path and open a focus-managed
reader. The reader previews the question without its answer or explanation;
grading belongs to the server. The ordinary reader offers no manual completion save. The
**Interactive tutorial** path owns saved checkpoints, server-checked answers,
completion certificates and persistent learning growth; see
[Interactive Field Manual](interactive-learning.md). Its completion certificate
describes open-book completion with self-reported practice, not professional
qualification, independently verified mastery or a verified business outcome.
Existing certificates and reading history are preserved, not retroactively graded.

Anonymous and demo readers can preview the authored curriculum without any
PocketBase request. Signed-in readers combine the bundled curriculum with
the saved catalogue; a failed catalogue/progress read stays visible. Guided saving
requires a real saved tutorial ID and current server authorization. Merely
displaying a bundled lesson never fabricates a backend identity. Catalogue
completion comes from canonical guided states; duplicate legacy reading rows do
not influence that count or earn credit. Failed aggregate reads remain unknown.

## Migration and retention

Ship `1789700000_expand_business_learning.js` together with its `data/` directory
and `business.pb.js`, `business-policy.js`, and the existing workflow-policy
helper. The migration adds fields to existing collections and an approved
content state. It does not relax any collection rule or mutate a live workspace
from this coding session.

The seed reuses the six original summaries only when title, original summary
and order match and no body/slug is present. It adds the remaining nineteen
lessons using stable IDs. Edited or ambiguous legacy rows are preserved; a
separate canonical starter can coexist with a custom lesson. A repeated up
does not duplicate records or overwrite an existing body. Explicit collisions
fail rather than choosing an arbitrary record.

Ordinary application rollback should retain the additive schema and receipts.
The explicit down removes the new fields and therefore their stored contents;
take an authorized backup and coordinate hook/UI rollback before using it. It
retains tutorial summaries, their IDs, all learning-progress rows and the added
approved select value so historical states remain readable. It does not delete
collections or learning history. Reapplying hydrates the retained identities.

## Acceptance and verification

```bash
node --test tests/upgrade/business-learning.test.mjs
node --test --experimental-test-coverage --test-coverage-include=apps/pocketbase/pb_hooks/business-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/business.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js --test-coverage-include=apps/web/src/lib/businessPlanning.js --test-coverage-include=apps/web/src/lib/tutorialCurriculum.js tests/upgrade/*.test.mjs
npm --prefix apps/web test -- src/pages/workspace/__tests__/BusinessDesks.test.jsx src/components/workspace/__tests__/TutorialCatalog.test.jsx src/pages/__tests__/HomePage.test.jsx
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Node tests execute production helpers, hooks and migration code with storage
contracts. They are not native PocketBase or React execution. On an isolated
PocketBase 0.39.8 instance, test original six-row upgrade, empty/custom catalogue,
repeated migration, seed asset availability, role removal, foreign relations,
review tampering, publication receipt attribution and down/up retention.
Check simultaneous editorial commands against the same saved revision and retain
the exact retry key after uncertain responses. The matching command-backed client
and locked migration must ship together; ordinary raw record writes are denied.

After installing the declared frontend dependencies, run the component suites
and coverage gates. Exercise ERP edits, draft recovery and lesson completion at
320, 375 and 1280 px in both themes using Tab/Shift-Tab, Escape and focus return.
Keep source validation, native acceptance and confirmed live delivery as
separate results in the dispatch report and private delivery handoff.
