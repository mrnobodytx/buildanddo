# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/interactive-learning.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js, apps/web/src/components/workspace/InteractiveTutorial.jsx, apps/web/src/components/workspace/TutorialGrowth.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/tutorial-learning.js; CONSUMES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js; CONSUMES apps/web/src/components/workspace/InteractiveTutorial.jsx; CONSUMES apps/web/src/components/workspace/TutorialGrowth.jsx
# DAG Node:    none
# Intent:      Explain persistent guided learning and the exact completion, growth and certificate guarantees an installed backend must verify.
# ───────────────────────────────────────────────────────────────

# Interactive Field Manual

Open **Field Manual** at `/app/tutorials`. Each installed, structured lesson now
offers **Interactive tutorial** alongside its ordinary reader. The same catalogue
and personal growth display are shared with Docs and the home Field Manual.

1. Start the tutorial to save its lesson version under your account.
2. Read each section and select **Save checkpoint and continue**. Close at any
   checkpoint and resume it after signing back in, including from another device.
3. Work through the practice example and check each exercise item. The checklist
   is a recorded learner assertion; it does not run a business operation.
4. Submit the final knowledge check. Wrong answers return a generic prompt to
   review the lesson and a 30-second retry wait, not the authored explanation.
   The server checks the saved lesson's answer before completion.
5. Receive a **BuildAndDo certificate of completion** and 100 learning points.
   Download the certificate or find it later under **My certificates**. Its HTML
   opens offline and can be printed or saved as a PDF using the browser.

The certificate records the learner name at completion, tutorial title/version,
content fingerprint, issue time and stable receipt ID. It certifies completion
of this open-book educational tutorial with self-reported practice. It is not a
signed W3C credential, independently verified mastery, TEVV result, professional
qualification or external accreditation. Guided responses contain only the
question and choices; feedback follows an answer command. Browser previews,
catalogue reads and public feeds omit grading keys and pre-answer explanations.
The authored keys remain in public repository source; removing them from the
browser does not make these questions a secret or proctored examination.

## Persistent growth

Learning points are derived from unique saved guided completions, not a writable
browser counter. Each tutorial earns 100 points once. Reviewing it, retrying a
save or starting it on another device retains the same certificate and points.

| Level | Learning points | Educational feedback |
|---|---:|---|
| Explorer | 0 | Start a first tutorial |
| Practitioner | 100 | First-finish milestone and reflection practice |
| Builder | 500 | Five-lesson milestone and peer teaching challenge |
| Guide | 1,000 | Ten-lesson milestone; keep exploring and teaching |

Existing manual tutorial completions remain visible in lesson history. They do
not receive retroactive certificates or points; learners can complete the guided
version to earn those. Catalogue completion uses canonical `tutorial_learning`
states from `/api/buildanddo/learning/states`, not manual reading rows. Direct
`tutorial_progress` create/update/delete operations are locked; historical rows
remain owner-readable. A failed or truncated aggregate read shows unknown
completion, not zero or an optimistic fallback. An individually readable public
lesson remains openable even when a restricted enrollment makes the aggregate
unavailable; its detail and commands recheck access. Mission learning retains its
separate shared practice/self-report and does not grant personal competence.
The independently audited contributor reputation and XP/TP ledger are unchanged.
Learning does not grant permissions, money or verified business outcomes.

## Storage and recovery

Native `users` authentication protects `/api/buildanddo/learning` and its
`/{tutorial}` detail/command endpoints. Every response uses `Cache-Control:
no-store`; the client discards late responses after account changes. Anonymous
and demo views read only the bundled lessons and do not request personal growth.

`tutorial_learning` is locked against direct record API reads and writes. A unique
`(owner, tutorial)` index bounds enrollment and credit. The server freezes the
lesson snapshot at enrollment, checks its content digest, requires sections in
order, validates the practice checklist, and grades the final answer. An existing
enrollment continues to use its original content when the catalogue is edited.
Current catalogue access is rechecked before detail reads and commands.

Each command is monotonic and naturally idempotent. Lost responses can replay the
same action without another award. Completion and certificate issuance run in
one database transaction. New writes no longer mirror into legacy reading rows;
that mixed-authority projection is not the completion source. Old duplicate
progress rows and all prior certificates are retained unchanged. A failed write
cannot leave a certificate with an unrecorded checkpoint transition.

Certificate history remains stored and personal if a current catalogue entry
becomes unreadable; reads still require its current scope and can be denied.
Export is explicit, contains no email or private workspace evidence,
escapes all text, and contains no scripts or remote assets. It includes a name;
the learner controls any later sharing. A digest identifies saved content and
does not establish third-party authenticity.

## Install and rollback

Ship `1790600000_tutorial_learning.js`, `tutorial-learning.js`,
`tutorial-learning.pb.js`, and their existing `workspace-access.js` and
`workflow-policy.js` dependencies with the matching web build. Existing tutorial
catalogue migrations must already be installed. This source change does not
apply migrations or change a shared backend.

The claim-authority continuation also requires
`1791500000_learning_progress_authority.js` and
`1791500100_tutorial_answer_wait.js` with the keyless-response backend and matching
client. The first locks legacy progress writes without awarding or deleting
anything. Its down path keeps that security lock and all owner-readable history;
do not restore owner-writable completion as a rollback. The second stores the
answer wait; removing it disables guided commands until the matching schema is
restored. Public reading and question previews remain available without saving
progress or locally grading answers.

The migration is idempotent and rejects incompatible custom definitions. Its
explicit down path removes the protocol marker to disable new learning commands
while keeping all checkpoint and certificate records locked and retained. Up
restores the marker and re-enables those records. Ordinary web rollback should
retain the additive data. No learner history or existing progress is deleted.

## Verification

```bash
node --test tests/upgrade/tutorial-learning*.test.mjs
npm --prefix apps/web test -- src/components/workspace/__tests__/InteractiveTutorial.test.jsx src/components/workspace/__tests__/TutorialCatalog.test.jsx
python tests/upgrade/test_tutorial_learning_native.py --require-binary
npm --prefix apps/web run lint
npm --prefix apps/web run build
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

Set `BUILDANDDO_TEST_POCKETBASE` to the isolated test binary for the native gate.
The existing CI matrix requires the test on both declared PocketBase versions.
It checks actual authentication/rules, process-restart persistence, concurrent
completion, personal isolation and down/up retention. The Node suites execute
the production commands against the repository's explicit storage double; they
do not establish native database behavior or rendered browser acceptance.

The rendered cases cover resumption, a wrong-answer retry, certificate issuance,
growth, lost-response recovery, preview/demo isolation and logout during a save.
Before rollout, also use keyboard and 320px/desktop views in both themes with
reduced motion, and verify the downloaded certificate in print preview. Validation
results and any unavailable gates are recorded in the dispatch learning report.
