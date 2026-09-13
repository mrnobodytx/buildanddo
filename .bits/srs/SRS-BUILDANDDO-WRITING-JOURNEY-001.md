# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-WRITING-JOURNEY-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WRITING-JOURNEY-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-12
# Depends:     apps/web/src/pages/WritingChallengePage.jsx,
#              apps/web/src/lib/writingEducation.js, apps/web/src/App.jsx
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/web/src/lib/writingEducation.js;
#              CONSUMES SRS-CN-BUILDANDDO-EDUCATION-API-001
# Intent:      Specify the public educational writing journey and the claim
#              separation it must display, so the platform never tells a
#              learner it proved something it did not.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-WRITING-JOURNEY-001 — The public writing journey

**Status:** in_progress **Risk:** A1 **Seat:** C-ONE

## Problem

BuildAndDo is an educational collaborative platform (SRS-BUILDANDDO-PURPOSE-001), but it had no public surface
where a visitor could actually do a piece of educational work end to end. The roadmap and practice pages
describe the platform; nothing let someone write, get coached, decide what to do about the coaching, and walk
away with a record of it.

There is a second, sharper problem. The Citadel side can now produce a cryptographic evidence chain for a
learner's submission — authenticated writer, content hash, Merkle inclusion, epoch verification. The obvious
thing to render from that is a green tick saying "human authored". **That would be a lie.** A learner can paste
AI-generated prose and produce a byte-identical record. Authentication and integrity establish *who submitted
which bytes and that nothing changed them*; they cannot establish who composed them. A UI that collapsed those
into one claim would teach learners to trust a proof nobody made, and would misrepresent their work to anyone
reading the evidence later.

## What must be true

1. A visitor can reach `/write` with no account and see the challenge, its constraints, and how it is assessed.
2. The learner writes every word of Track A. No control on the page inserts prose into their draft.
3. Coaching is Track B: observations with evidence. Accepting one records a decision and changes no text —
   which is why the control reads "Note this", not "Apply".
4. Rejecting is a first-class outcome and is never presented as failure or scored against the learner. There is
   no metric anywhere on the page that rises when more suggestions are accepted.
5. An axis the scorer declined to assess is shown as **not assessed**, never as a number that would read as a
   grade.
6. The evidence view renders **four separate claims**, never one:
   - `Submission` — authenticated learner submission, or not yet
   - `Integrity` — evidence epoch verified, or awaiting admission
   - `Historical witness` — witnessed, or not yet
   - `Content origin` — derived from the learner's recorded interaction history, never from cryptography
7. When the writing service is unreachable or errors, the page says so and shows nothing else. It never renders
   placeholder or fabricated challenge content, and it never shows a loading state next to an error.

## Non-goals

- No account, login or tenancy work. This page consumes an existing facade.
- No deployment. Shipping `/write` to production is a separate, authorised step.
- No claim about correctness of the learner's writing. The rubric asks questions; it does not grade.

## Evidence

- `apps/web/src/lib/writingEducation.js` — `readClaims()` maps each claim to the field that actually
  establishes it, and returns the pending/unknown wording where the platform cannot yet prove something.
- `apps/web/src/pages/WritingChallengePage.jsx` — renders the four claims as separate rows.
- Verified in a browser 2026-09-12 against the dev server with no API proxy: the page renders the real
  `HTTP 404` and the line *"this page reports what it has, not what it wishes it had"* rather than inventing a
  challenge.

## Upstream

The API is `SRS-CN-BUILDANDDO-EDUCATION-API-001` (Citadel side). `AUTHORSHIP_PROVENANCE_READY` is `false`
there, so `Submission` correctly renders as *not yet an authenticated learner submission* until the shared
Rooms transcript path is repaired and verified. That is the honest state, not a bug in this page.
