# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-PURPOSE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-PURPOSE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     apps/web/src/lib/purpose.js, apps/web/index.html,
#              apps/web/src/components/site/{Hero,Faq,Footer,EarlyAccess}.jsx,
#              apps/web/src/pages/{HomePage,OnboardingPage,RoadmapPage}.jsx,
#              README.md, AGENTS.md
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/web/src/lib/purpose.js;
#              VALIDATES apps/web/src/lib/__tests__/purpose.test.js
# Intent:      Specify the purpose correction: BuildAndDo is an educational,
#              collaborative platform, and every public surface says so from
#              one canonical statement.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-PURPOSE-001 — One canonical purpose statement

**Status:** in_progress **Risk:** A0 **Seat:** C-ONE

## Problem

The public site, the front-page metadata, the FAQ, the early-access form, the
onboarding screen and the repository README each carried their own wording of
what BuildAndDo is - and that wording described a small-business provisioning
and operations tool. Operator feedback (2026-09-11, verbatim intent): the
product "is an educational collaborative platform, not an SMB provisioner".
Six surfaces with six phrasings is how the drift happened; there was no single
place the purpose lived.

## Intent

Put the purpose in one module, `apps/web/src/lib/purpose.js` (`PURPOSE` with
headline, subhead, description, audience, tagline), and have every surface
that describes the product read it - or, for static files that cannot import
it (`index.html`, `README.md`, `AGENTS.md`), be checked against it by a test.

## Scope

- `apps/web/src/lib/purpose.js` - the canonical statement and `pageTitle()`.
- `apps/web/index.html` - `<title>`, meta description, og:title,
  og:description, og:type, twitter:card; text must equal `PURPOSE`.
- `apps/web/src/pages/HomePage.jsx` - document title, `DESCRIPTION` for the
  JSON-LD blocks, masthead tagline, front-page hero copy, section labels that
  framed the reader as a business owner.
- `apps/web/src/components/site/Hero.jsx` - headline, subhead, CTAs from
  `PURPOSE`; the illustrative demo stays labelled illustrative.
- `apps/web/src/components/site/Faq.jsx` - questions retargeted to learners
  and collaborators; the honesty answers (no automatic actions, no claims
  about data practices we cannot back) are kept.
- `apps/web/src/components/site/Footer.jsx` - tagline from `PURPOSE`; product
  links become absolute routes so they work from every page.
- `apps/web/src/components/site/EarlyAccess.jsx` - copy and the select
  options; the PocketBase field `business_type` keeps its name (schema is
  unchanged), the label says what the field now collects.
- `apps/web/src/pages/OnboardingPage.jsx` - intro copy; the domain-selection
  flow is unchanged.
- `apps/web/src/pages/RoadmapPage.jsx` - intro sentence.
- `README.md` - first paragraph and a "What BuildAndDo is" section.
- `AGENTS.md` - purpose line under "What this repo is".
- `apps/web/src/lib/__tests__/purpose.test.js` - asserts `index.html` carries
  `PURPOSE` verbatim, and that none of the surfaces above (nor `apps/web/src`
  as a whole) contain "small business", "SMB" or "provision" - except the
  technical `seat_not_provisioned` wording in `ocnLogin.js` and its tests.

## Out of scope

- Any change to what the product does. This is copy and metadata only; no
  feature or number is introduced.
- Workspace pages under `/app` (they describe workspace records, not the
  product) and the illustrative demo content in `Hero.jsx` / `OnboardingPage`
  `DEMO_RESULTS`, which stay labelled illustrative.
- Renaming the `early_access.business_type` PocketBase field.

## Authority

| Step                    | Who  | Authority   |
|-------------------------|------|-------------|
| write copy              | web  | none        |
| register this spec      | web  | A0          |

## Acceptance evidence

1. `npm test` runs `purpose.test.js` green: `index.html` matches `PURPOSE`
   and the forbidden-term scan finds nothing outside the ocnLogin allowlist.
2. `grep -rniE "small.business|\bsmb\b|provision" apps/web/src apps/web/index.html README.md AGENTS.md`
   returns only `ocnLogin.js`, `ocnLogin.test.js`, `LoginPage.ocn.test.jsx`
   and this spec.
3. `python scripts/ci/agent_context.py --check` passes with this code
   registered.

## Verification

```bash
npm test
npm run build
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```
