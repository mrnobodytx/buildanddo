# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-PURPOSE-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-PURPOSE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PURPOSE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-PURPOSE-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-PURPOSE-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that makes the public pages describe an educational platform.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-PURPOSE-001

**SRS:** SRS-BUILDANDDO-PURPOSE-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

A visitor reading any public page learns the same thing: BuildAndDo is an educational, collaborative platform
where people learn by doing real work together, with people and AI, and keep the evidence.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | `purpose.js`, the one source, and a guard test that fails on a planted phrase | `vitest run src/lib/__tests__/purpose.test.js` | done |
| 2 | FAQ, About intro, footer, unused Hero, sign-up, pricing and docs intros | the whole web suite | done |
| 3 | Early-access form asks about learning; stored field names unchanged | the whole web suite | done |
| 4 | Share image: live domain, re-rendered PNG proven against a render of the unchanged SVG; alt text | `npm run build`; pixel comparison | done |
| 5 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | done |
| 6 | Continuation R6: the challenge entry, its page and the judge-bundle defaults describe the educational platform | `vitest run src/lib/__tests__/purpose.test.js src/__tests__/HostingerChallengePage.test.jsx` | done |
| 7 | Give jsdom `URL.revokeObjectURL`, so a loaded run cannot fail on the blueprint download timer | the whole web suite, twice | done |

## Constraints

- Files this dispatch may touch:
  - `apps/web/src/lib/purpose.js` and its test;
  - `apps/web/src/components/site/{Faq,Footer,Hero,EarlyAccess}.jsx`;
  - `apps/web/src/pages/{AboutPage,SignupPage,PricingPage,DocsPage}.jsx`;
  - `apps/web/src/components/Seo.jsx`;
  - `apps/web/tools/generate-seo.mjs`;
  - `apps/web/public/social-card.{svg,png}`;
  - for the continuation:
    - `apps/web/src/data/hostingerChallenge.js`;
    - `apps/web/src/pages/HostingerChallengePage.jsx` and its test;
    - `apps/web/src/lib/publicPages.js` (the page's description);
    - the regenerated `apps/web/public/llms.txt`;
    - `scripts/ci/day21_submission.py` (defaults and demo line only);
    - `apps/web/src/test/setup.js` (one jsdom stand-in);
  - this bookkeeping and the readiness and context locks.
- The backend and the stored early-access field names do not change.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier: deploy, push. Neither is performed without the operator.

## Evidence (2026-09-23, local run on Windows, LF checkout)

- **Guard:** `purpose.test.js` 5 of 5. It scans 30+ public sources: site components, editorial, auth, public
  pages, `Seo.jsx`, `publicPages.js`, `index.html`, the manifest, the share SVG, `llms.txt` and the SEO
  generator.
- **Controls:** each change was undone once and the guard was run again. All 12 were caught, and it was
  green again after each restore.
  - The base versions of `Faq.jsx`, `AboutPage.jsx`, `Footer.jsx`, `Hero.jsx`, `EarlyAccess.jsx`,
    `SignupPage.jsx`, `Seo.jsx` and `generate-seo.mjs` were put back one at a time.
  - The share image was set back to the domain with no DNS record.
  - The SVG was edited without re-rendering the PNG.
  - The manifest was allowed to drift from the one source.
  - A retired phrase was planted in the page head.
- **Suite:** the whole web suite passes 614 of 614 in 71 files. `npm run lint` is clean.
- **Build:** `npm run build` passes, and every generated page carries the new share-image description.
  - None of the retired phrases appears in the generated home or About pages.
  - `llms.txt`, `robots.txt` and `sitemap.xml` came out byte-identical.
- **Redaction:** the changed sources PASS. The build's only match is the voice SDK's unspecified
  (all-zeros) address, a known finding of SRS-BUILDANDDO-BUDDI-003.
- **Served build** (vite preview):
  - The home page shows the new FAQ, the footer description, the early-access questions ("Where are you
    starting from?", "What do you want to learn or build first?") and both alt tags.
  - `/about`, `/signup`, `/pricing` and `/docs` show the new intros.
  - No retired phrase appears in any rendered page body. There are no console errors.
  - `/social-card.png` serves the new image.
- **Share image:**
  - **The committed PNG was stale.** It still showed "THE BUSINESS NEWSPAPER FOR YOUR OWN OPERATIONS" and
    "Your business, in evidence." Four commits on 2026-09-18 had rebranded the SVG without re-rendering it.
  - **The renderer changes fonts, not layout.** The 2026-09-14 PNG came from an unknown renderer with a
    fallback serif. A headless-Chromium render of that same SVG differs only in text rasterization (5.97% of
    pixels, all within text), because Chromium uses the Georgia the SVG names.
  - **Only the domain changed.** A Chromium render of today's SVG and the corrected SVG differ in 329
    pixels, all inside the domain line (x 185-229, y 540-553).
  - `social-card.png.cgrf.yaml` records the SVG's SHA-256, and the guard fails when they diverge.
- **Gates:** all pass.
  - `hostinger_readiness.py --check`
  - `agent_context.py --check`
  - `submission_readiness.py --check`
  - `verify_public_boundary.py`

## Continuation evidence (2026-09-23, R6)

- **Tests:** `purpose.test.js` 6 of 6 and `HostingerChallengePage.test.jsx` 3 of 3. The new test compares the
  compiler's `--pitch`, `--problem`, `--solution` and `--target-audience` defaults with the page's data, and the
  promise with `purpose.js`.
- **Controls:** each change was undone once and the tests were run again. All 6 were caught, and they were
  green again after each restore.
  - The base versions of `hostingerChallenge.js`, `HostingerChallengePage.jsx`, `publicPages.js` and
    `day21_submission.py` were put back one at a time.
  - The judge bundle's pitch was allowed to drift from the page.
  - The page's problem was allowed to drift from the judge bundle.
- **Build:** `npm run build` passes and regenerates `llms.txt`, so the page's description there changes too.
  The guard caught the stale committed copy first.
- **The whole web suite passes 615 of 615, and `npm run lint` is clean.**
- **The flaky run** came from a jsdom gap, not from this change.
  - Before the stand-in, three full runs under load all ended with exit 1 and 2 unhandled
    `URL.revokeObjectURL is not a function` errors, although every test passed. Two runs were on this branch
    and one on the base commit.
  - The source is BlueprintSavedPage's download timer. Its test file alone passes on both trees.
  - With the stand-in in `src/test/setup.js`, two full runs under the same load exit 0.

## Findings, not fixed here

- **The Hostinger challenge entry is reframed** by this continuation (R6), on the operator's direction.
- **The workspace keeps its business framing:**
  - onboarding defaults a workspace to "My business";
  - Signals say "Observed changes in your business";
  - the policy walkthrough is a "small-business demo".
  These describe the product as it works today.
- **The early-access record still names its field `business_type`.** Only its visible question and options
  changed.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] The guard test fails on a planted retired phrase and passes without it.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
