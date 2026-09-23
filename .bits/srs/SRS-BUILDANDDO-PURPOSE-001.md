# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-PURPOSE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-PURPOSE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PURPOSE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/web/src/components/site/Faq.jsx, apps/web/src/pages/AboutPage.jsx,
#              apps/web/src/components/site/Footer.jsx, apps/web/src/components/site/EarlyAccess.jsx
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/web/src/lib/purpose.js; GOVERNS apps/web/src/components/site/Faq.jsx;
#              GOVERNS apps/web/src/pages/AboutPage.jsx; GOVERNS apps/web/src/components/site/Footer.jsx
# Intent:      Make every public page say what BuildAndDo is: an educational, collaborative platform where
#              people learn by doing real work together and keep the evidence.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-PURPOSE-001 — Every public page says BuildAndDo is an educational platform

## Why this exists

The operator decided on 2026-09-11 that BuildAndDo is an educational, collaborative platform: people learn by
doing real, verified work together, with guilds and AI agents. It is not small-business software. The home
page title, the app manifest and the share image already say so.

On 2026-09-23 a live audio check asked Buddi, the voice agent, what BuildAndDo is. It answered with the
retired small-business pitch. The site itself still teaches that pitch, and the operator directed: "Fix the
page, we're an educational platform". Where it still appears:
- **FAQ:**
  - "early-stage software for small-business owners";
  - "primarily small-business owners and operators";
  - "a first group of small-business owners";
  - "What happens to my business data?";
  - "the questions a first-time business owner would actually ask".
- **About intro:** "a Citadel Nexus Inc. product for people who run businesses".
- **Footer tagline:** "helps small-business owners notice changes".
- **An unused Hero:** "small-business operating help".
- **Early-access form (home page):** salon and consultant business types, and a "repetitive task" question.
- **Sign-up page:** "You'll set up your business next".
- **Pricing and docs intros:** "a real business problem", "one business question".
- **Share-image description:** "your business, in evidence", although the image itself says "Learn by doing.
  Together."
- **Share image domain:** it prints a domain with no DNS record.

## Requirements

1. **R1 - one source for the description.** `apps/web/src/lib/purpose.js` holds the canonical line and the
   one-sentence description. The About intro, the footer, the first FAQ answer, the unused Hero and the
   share-image description all read it. It is plain JavaScript with relative imports only, so
   `tools/generate-seo.mjs` can read it under bare Node.
2. **R2 - honest answers.**
   - The FAQ describes a learning platform: who it is for, what a member does, early access and data practices.
   - It claims nothing the platform does not do.
   - It keeps the safety answer (bounded missions; you approve before anything runs).
   - It says that talking to Buddi sends speech to ElevenLabs, where it may be recorded.
3. **R3 - the early-access form asks about learning.**
   - Its questions ask where the person is starting from and what they want to learn or build first.
   - The stored field names (`business_type`, `task`) do not change.
   - Both are text fields, so older sign-ups stay valid.
4. **R4 - the share image tells the truth.**
   - The image names the live domain, buildanddo.com.
   - Its PNG is re-rendered from the SVG, and a render of the unchanged SVG is compared with the current PNG
     first. That comparison proves the renderer faithful.
   - The alt text describes what the image shows.
5. **R5 - the retired framing cannot come back unnoticed.** A test fails if any public page source, the page
   head, the share image or the SEO generator says any of these:
   - "software for small-business owners";
   - "people who run businesses";
   - "small-business operating help";
   - "your business, in evidence";
   - "first-time business owner".
   The test proves itself by failing on a planted phrase.

## Continuation (2026-09-23): the challenge entry

The first pull request left the Hostinger 21-Day Startup Challenge entry out, as the operator's call. The
operator then chose "Reframe it too". The entry still pitched "BuildAndDo watches the important parts of a small
business", which is the sentence Buddi repeats almost word for word. Its submission compiler wrote the same pitch
into the judges' bundle.

6. **R6 - the challenge entry describes the educational platform.**
   - `data/hostingerChallenge.js` takes its promise from `purpose.js` and states a learning audience, problem,
     solution and demo.
   - The page's headline, calls to action, demo step and "Business idea" / "Business potential" rows follow.
   - `scripts/ci/day21_submission.py` carries the same four texts as its defaults for the judge bundle. A test
     fails when the page and the bundle drift apart; the compiler's own checklist asks that they match.
   - The challenge's structure, products, criteria and weights are unchanged.

## Non-goals

- The workspace's own model: onboarding's optional website domain, signals that describe "your business",
  and the small-business policy walkthrough. They describe the product as it works today.
- Buddi's agent configuration, which is a separate, operator-approved lane.
- Deployment. The challenge deadline is 2026-09-24, so the deploy is time-critical, and it is the operator's.

## Verification

```bash
npm --prefix apps/web exec -- vitest run src/lib/__tests__/purpose.test.js
npm --prefix apps/web exec -- vitest run
npm run lint
npm run build
python scripts/ci/public_redaction.py scan dist/apps/web
python scripts/ci/verify_public_boundary.py
```
