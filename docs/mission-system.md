# ─── CGRF Header ───────────────────────────────────────────────
# File:         docs/mission-system.md
# Stage:        06_PLAN
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-15
# Depends:      apps/web/src/lib/missionLearning.js, apps/pocketbase/pb_hooks/mission-policy.js, tests/upgrade/mission-system.test.mjs
# EnumType:     Doc
# EnumEdges:    DEPENDS_ON apps/web/src/lib/missionLearning.js; DEPENDS_ON apps/pocketbase/pb_hooks/mission-policy.js; DEPENDS_ON tests/upgrade/mission-system.test.mjs
# DAG Node:     none
# Intent:       Explain how to build and validate educational missions, why their checks differ, and which backend and credential guarantees are actually provided.
# ───────────────────────────────────────────────────────────────

# Build a mission system that teaches its operators

BuildAndDo uses the existing `missions` and `evidence` collections. The mission
builder is at `/app/missions`; its how-to guide is also in `/docs#mission-building`
and the Field Manual. A mission records a bounded plan and the team's observations.
It does not run an automation, grant deployment authority or issue a certification.

## How to use it

1. Read prior work, then start a mission with the problem, beneficiary, baseline,
   target and scope. Save an incomplete draft whenever needed.
2. Add authorization boundaries, untrusted-input checks, data protection and a
   stop/recovery plan. Choose the appropriate internal A0–A2 tier. Shared/staging
   or higher-risk work requires separate owner approval outside this flow.
3. Plan all four TEVV methods before measuring the result. A filled field is
   preparation, not proof that a check ran or that its content is adequate.
4. An authorized workspace member reviews the saved proposal and explicitly
   records approval. The server attributes the decision to that account.
5. Record work started after approval. The team performs the work in its
   authorized environment. Pause when attention is needed. Revising an approved
   or paused plan returns it to Proposed and clears the earlier approval/review.
6. Open **Learn and review**, add source-backed evidence, and record each actual
   TEVV outcome. Select evidence belonging to this mission and workspace.
7. Verify only after four passing observations, readable evidence and a review
   reflection. Record an honest failed outcome when appropriate. Finished work
   stays finished; another attempt is a new mission.

## Why these checks are separate

| Practice | Mission question | Why it matters |
|---|---|---|
| NIST AI RMF: Govern / Map | Who benefits, who decides, and what is outside scope? | A tool request or a point total cannot grant authority. |
| Testing | Does the behavior match the specification on selected inputs? | Normal, boundary and failure cases reveal different defects. |
| Evaluation | How does observed performance compare with a fixed baseline and target? | Moving the target after seeing a result hides failed experiments. |
| Verification | Can a reviewer inspect requirements and reproduce the evidence? | A status label is insufficient evidence. |
| Validation | Does it solve the intended problem for the intended users in context? | Correct code can still produce an unsuitable outcome. |
| NIST AI RMF: Measure / Manage | What did the checks establish, and what action follows? | Uncertainty and failures inform the next decision. |
| OWASP application and GenAI security | Are permissions, inputs, outputs, data and recovery bounded? | Retrieved content or model output is untrusted data, not authorization. |
| W3C Verifiable Credentials | Who issued a claim, who is its subject, and how is integrity checked? | A valid proof does not establish the factual truth of a business outcome. |

These are educational mappings, not an exhaustive NIST/OWASP assessment. Internal
A0–A2 labels are BuildAndDo authority tiers, not NIST-defined risk categories.
TEVV review records workspace assertions; it is not an independent audit.

References:

- NIST AI RMF 1.0: https://www.nist.gov/itl/ai-risk-management-framework
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP GenAI Security Project: https://genai.owasp.org/
- W3C Verifiable Credentials Data Model 2.0: https://www.w3.org/TR/vc-data-model-2.0/

The session phrase “wor3 voc” is provisionally interpreted as W3C Verifiable
Credentials. No alternate internal framework is defined by this implementation.

## Persistence and trust boundaries

The additive migration stores `mission_plan`, `mission_learning`, `mission_review`
and server-attributed approval/review accounts and timestamps on `missions`.
No collection access rule is relaxed. Existing unstructured missions remain
readable; they need a plan and recorded approval before advancing into this flow.

PocketBase request hooks enforce bounded schemas, the transition graph, immutable
ownership/workspace, writable workspace membership, and plan/review requirements.
The browser mirrors those rules for useful feedback but is not the authority.
Unknown reward counters and arbitrary answer IDs are rejected. A verified outcome
requires four passing observations, a reflection and readable evidence with a
source and content from the same mission/workspace. Native collection rules still
apply; a reviewer cannot use an evidence record they cannot read.

The plan and goal are frozen after approval. Pause and return to a proposal before
changing them. Verified and failed mission outcomes cannot be reopened or rewritten
through the mission request API. Learning answers can still be recorded afterward.
The existing owner-only delete operation remains explicit and warns about cascading
evidence deletion. Referenced evidence can change or become unavailable; this is
not a tamper-proof ledger and is not a CK signing or credential system.

Account, workspace and demonstration-mode changes remount mission forms. Late
requests cannot populate a different account's draft or preview. Demonstration
records are read-only. Private mission regions are masked from replay/autocapture;
existing mutation telemetry records bounded action/outcome metadata, not plan text.

## Educational rewards

Rewards are derived from saved mission data; there is no incrementing points API.
The points belong to the mission's learning record and do not represent a personal
qualification. They unlock educational content only.

| Saved milestone | Credit |
|---|---:|
| Purpose/scope, security, TEVV methods | 10 each |
| Four correct knowledge checks | 15 each |
| Complete observed review with evidence and reflection | 10 |
| Maximum per mission | 100 |

A complete review of a failed experiment earns the same learning credit as a
passing review. Repeated answers add no extra points. At 30 points a worked TEVV
example opens; at 60 a five-question review coach opens. Core guidance remains
available throughout. There are no money, streak, ranking or permission bonuses.

Short step transitions, progress changes and feedback pulses use the existing theme
tokens. A persistent animation switch and `prefers-reduced-motion` disable them.
All rewards and outcomes remain available as text with keyboard-operable controls.

The download is an **unsigned learning record** containing mission/evidence IDs,
saved learning points and reference links. It omits evidence contents, identities
and plan text, has no W3C VC `proof` or credential envelope, and is not a signed
credential or certification. Issuer trust, validity/status and proof verification
would require a separately authorized issuer integration.

## Validation and rollout

Dependency-free contract tests execute the actual policy/helper, request hook,
migration and learning selectors:

```bash
node --test tests/upgrade/mission-system.test.mjs
node --test --experimental-test-coverage --test-coverage-include=apps/web/src/lib/missionLearning.js --test-coverage-include=apps/pocketbase/pb_hooks/mission-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/missions.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js tests/upgrade/mission-system.test.mjs
npm --prefix apps/web test -- src/pages/workspace/__tests__/MissionsPage.test.jsx src/components/workspace/missions/__tests__/MissionFlow.test.jsx
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Node tests use PocketBase JSVM contract doubles. They are not proof of native
PocketBase compatibility. Frontend suites and browser behavior require the declared
dependencies; the session's missing dependency/lock state is recorded in the dispatch
report. Nothing here claims live backend execution, production ingestion or TEVV
acceptance solely from parsing the source.

The deployment owner must apply the new migration and request hooks with the UI
before enabling mission writes. Do not ship only the browser validator. On the
actual pinned PocketBase runtime, verify schema installation, rejection of foreign
workspace/evidence writes, explicit approval attribution, plan freezing, terminal
outcomes and rollback. Browser acceptance covers save/retry, keyboard focus,
320/375/1280-pixel layouts, both themes, reduced motion and account switching.
This source change performs no deployment or shared database mutation.

For a code rollback, revert the UI/hooks together and retain the additive fields
so saved plans/reviews are preserved. The explicit down migration removes those
new fields and their stored data; use it only with the deployment owner's data
retention decision. It leaves existing mission fields and access rules intact.
