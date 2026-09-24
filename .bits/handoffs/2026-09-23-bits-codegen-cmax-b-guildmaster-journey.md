# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-23-bits-codegen-cmax-b-guildmaster-journey.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-JOURNEY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-JOURNEY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/web/src/lib/journey.js, docs/field-interviewer-v1.3.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/web/src/lib/journey.js; DEPENDS_ON docs/field-interviewer-v1.3.md
# DAG Node:    none
# Intent:      Let the private Guildmaster voice interviewer start from the same five journey answers the public page compiles.
# ───────────────────────────────────────────────────────────────

# Handoff: BITS-CODEGEN -> CMAX-B (Field Interviewer / Guildmaster runtime)

The public journey at `/app/journey` asks five multiple-choice questions
(`JOURNEY_QUESTIONS` in `apps/web/src/lib/journey.js`) and compiles a lesson and a
proposed mission draft with `compileJourney`. Today "Talk it through with the
Guildmaster" opens the existing workspace assistant with the answers typed into
its composer (window event `buildanddo:assistant-draft`, `detail.message`).

Requested of the private interviewer (FI-KB-1.3.0 boundary unchanged):

1. Accept the five answer ids as the interview's opening context instead of
   re-asking them; use `assistantDraft(compiled)` as the seed text if a string is
   simpler.
2. Ask only for what the compiler leaves blank: the person's measured baseline and
   their success criterion. Return them as draft text for the person to paste or
   confirm on the Challenge Desk. Do not approve, save or verify on their behalf.
3. When a public voice entry point exists, give BuildAndDo a URL or event name and
   the journey button can target it instead of the text assistant.

No private endpoint, persona or provider credential is referenced in this repository.
